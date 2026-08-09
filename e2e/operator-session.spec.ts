// input: @playwright/test, ./harness/console-guards
// output: Playwright E2E for the Console BFF operator session boundary (login, sealed cookie, proxy, origin, logout, storage leaks)
// pos: browser-level verification of the 38X-1C same-origin BFF boundary against the real backend
// note: if this file changes, update header and e2e/README.md
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

const CONSOLE_ORIGIN = "http://localhost:3100";
const SESSION_COOKIE = "controlhub.operator-session";
const EMAIL = "admin@example.com";
const PASSWORD = "secret123";

/**
 * All BFF requests go through `page.request` (the browser context's real
 * HTTP stack, sharing the context cookie jar) with the same Origin a real
 * same-origin fetch would send. No `page.evaluate` is used for requests.
 */
async function bffLoginViaRequest(page: Page) {
  const res = await page.request.post(`${CONSOLE_ORIGIN}/api/operator-session`, {
    data: { email: EMAIL, password: PASSWORD },
    headers: { Origin: CONSOLE_ORIGIN },
  });
  return { status: res.status(), body: await res.text() };
}

/**
 * Read-only storage snapshot. Playwright exposes no storage API; this is a
 * pure read (no requests, no state mutation) — same precedent as
 * query-credential-settings.spec.ts sessionStorage assertions.
 */
async function storageSnapshot(page: Page) {
  return page.evaluate(() => ({
    sessionStorageKeys: Object.keys(window.sessionStorage),
    localStorageKeys: Object.keys(window.localStorage),
    sessionStorageValues: Object.values(window.sessionStorage),
    localStorageValues: Object.values(window.localStorage),
    cookieHeader: document.cookie,
  }));
}

function assertNoCredentialLeak(snapshot: {
  sessionStorageKeys: string[];
  localStorageKeys: string[];
  sessionStorageValues: string[];
  localStorageValues: string[];
  cookieHeader: string;
}) {
  const allKeys = [
    ...snapshot.sessionStorageKeys,
    ...snapshot.localStorageKeys,
  ];
  const allValues = [
    ...snapshot.sessionStorageValues,
    ...snapshot.localStorageValues,
  ];
  // The Backend Bearer Credential must never be readable by browser
  // JavaScript: no legacy token key, no value carrying a bearer marker,
  // no browser-readable cookie, and the sealed session cookie must be
  // HttpOnly (absent from document.cookie).
  expect(allKeys).not.toContain("controlhub.token");
  expect(allKeys).not.toContain("controlhub.role");
  expect(allValues.join("\n")).not.toContain("Bearer ");
  expect(snapshot.cookieHeader).not.toContain("controlhub.token=");
  expect(snapshot.cookieHeader).not.toContain(SESSION_COOKIE);
}

test.describe("Operator session BFF boundary (38X-1C)", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("BFF login seals an HttpOnly operator session; the backend credential never reaches the browser", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    const login = await bffLoginViaRequest(page);

    expect(login.status).toBe(200);
    const body = JSON.parse(login.body) as Record<string, unknown>;
    expect(body.role).toBe("admin");
    expect("token" in body).toBe(false);
    expect(login.body).not.toContain("Bearer ");
    expect(login.body).not.toContain("MT:");

    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE);
    expect(session).toBeDefined();
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe("Strict");
    expect(session?.secure).toBe(false); // explicit local non-Secure exception
    expect(session?.path).toBe("/");
    // Fixed eight-hour maximum age (allow clock/rounding slack).
    const maxAgeSeconds = (session?.expires ?? 0) - Date.now() / 1000;
    expect(maxAgeSeconds).toBeGreaterThan(28_700);
    expect(maxAgeSeconds).toBeLessThan(28_900);
    expect(session?.value).not.toContain("MT:");
    expect(session?.value).toContain("v1.");

    assertNoCredentialLeak(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("BFF login with invalid credentials returns one generic unauthorized outcome", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    const res = await page.request.post(
      `${CONSOLE_ORIGIN}/api/operator-session`,
      {
        data: { email: EMAIL, password: "wrong-password" },
        headers: { Origin: CONSOLE_ORIGIN },
      },
    );
    expect(res.status()).toBe(401);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.message).toBe("unauthorized");
    // No backend failure internals leak into the controlled outcome.
    expect(JSON.stringify(body)).not.toContain("invalid");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("Bearer ");

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();
    assertClean(consoleMessages, networkErrors);
  });

  test("the protected BFF proxy forwards with the server-held credential", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    expect((await bffLoginViaRequest(page)).status).toBe(200);

    const res = await page.request.get(
      `${CONSOLE_ORIGIN}/api/proxy/resources?limit=2`,
    );
    expect(res.status()).toBe(200);
    const resources = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(resources.items)).toBe(true);
    expect(resources.items.length).toBeGreaterThan(0);

    assertNoCredentialLeak(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("the BFF proxy rejects a client-supplied Authorization header", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    expect((await bffLoginViaRequest(page)).status).toBe(200);

    const res = await page.request.get(
      `${CONSOLE_ORIGIN}/api/proxy/resources?limit=1`,
      { headers: { Authorization: "Bearer client-token" } },
    );
    expect(res.status()).toBe(400);

    assertClean(consoleMessages, networkErrors);
  });

  test("unsafe requests from a non-configured Origin are rejected", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");

    // Login POST from a foreign Origin is rejected and sets no session.
    const evilLogin = await page.request.post(
      `${CONSOLE_ORIGIN}/api/operator-session`,
      {
        data: { email: EMAIL, password: PASSWORD },
        headers: { Origin: "https://evil.example" },
      },
    );
    expect(evilLogin.status()).toBe(403);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

    // Logout DELETE from a foreign Origin is rejected.
    const evilLogout = await page.request.delete(
      `${CONSOLE_ORIGIN}/api/operator-session`,
      { headers: { Origin: "https://evil.example" } },
    );
    expect(evilLogout.status()).toBe(403);

    // Unsafe proxy method from a foreign Origin is rejected even with a
    // valid session.
    expect((await bffLoginViaRequest(page)).status).toBe(200);
    const evilProxy = await page.request.post(
      `${CONSOLE_ORIGIN}/api/proxy/resources`,
      {
        data: { name: "x" },
        headers: { Origin: "https://evil.example" },
      },
    );
    expect(evilProxy.status()).toBe(403);

    // Safe proxy method from a foreign Origin is allowed (no side effects;
    // SameSite=Strict still scopes the cookie to same-site requests).
    const foreignGet = await page.request.get(
      `${CONSOLE_ORIGIN}/api/proxy/resources?limit=1`,
      { headers: { Origin: "https://evil.example" } },
    );
    expect(foreignGet.status()).toBe(200);

    assertNoCredentialLeak(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("logout clears the operator session and protected pages require login again", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    expect((await bffLoginViaRequest(page)).status).toBe(200);

    // A valid Operator Session passes the route guard and drives a
    // protected page without any browser-readable credential.
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("nav")).toBeVisible();
    assertNoCredentialLeak(await storageSnapshot(page));

    const logout = await page.request.delete(
      `${CONSOLE_ORIGIN}/api/operator-session`,
      { headers: { Origin: CONSOLE_ORIGIN } },
    );
    expect(logout.status()).toBe(200);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

    // The proxy now returns the generic unauthenticated outcome.
    const proxyAfterLogout = await page.request.get(
      `${CONSOLE_ORIGIN}/api/proxy/resources?limit=1`,
    );
    expect(proxyAfterLogout.status()).toBe(401);

    // Protected navigation now redirects to login.
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);

    assertNoCredentialLeak(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });
});
