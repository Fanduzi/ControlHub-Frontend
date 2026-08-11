// input: @playwright/test, ./harness/{auth,console-guards}, lib/operator-session/{config,seal}
// output: Playwright E2E for the Console BFF operator session boundary (login, sealed cookie, proxy, origin, UI logout incl. fail-closed, forged/tampered/expired page gate, legacy-token rejection, viewport/locale coverage, storage leaks)
// pos: browser-level verification of the 38X-1C/38X-1D same-origin BFF boundary against the real backend
// note: if this file changes, update header and e2e/README.md
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { loginViaUI } from "./harness/auth";
import { resolveFixtureIdentity } from "./harness/fixtures";
import { loadOperatorSessionConfig } from "../lib/operator-session/config";
import { sealSession } from "../lib/operator-session/seal";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

const CONSOLE_ORIGIN = "http://localhost:3100";
const SESSION_COOKIE = "controlhub.operator-session";
// Provisioned per-run fixture operator (backend cmd/e2e-fixture-bootstrap);
// the retired 0002 seed accounts are refused by the resolver.
const FIXTURE = resolveFixtureIdentity("admin");

/** Must match e2e/harness/dev-server-wrapper.sh local BFF key material. */
const E2E_BFF_SESSION_KEY =
  "9f2c7e51b8a43d6f0c1e2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f";

function e2eSessionConfig() {
  const result = loadOperatorSessionConfig({
    CONTROLHUB_BFF_SESSION_KEY: E2E_BFF_SESSION_KEY,
    CONTROLHUB_BFF_CONSOLE_ORIGIN: CONSOLE_ORIGIN,
    CONTROLHUB_BFF_SECURE_COOKIES: "false",
  });
  if (!result.ok) throw new Error("e2e BFF config invalid");
  return result.value;
}

/**
 * All BFF requests go through `page.request` (the browser context's real
 * HTTP stack, sharing the context cookie jar) with the same Origin a real
 * same-origin fetch would send. No `page.evaluate` is used for requests.
 */
async function bffLoginViaRequest(page: Page) {
  const res = await page.request.post(`${CONSOLE_ORIGIN}/api/operator-session`, {
    data: { email: FIXTURE.email, password: FIXTURE.password },
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
  // JavaScript: no browser bearer key, no value carrying a bearer marker,
  // no browser-readable cookie, and the sealed session cookie must be
  // HttpOnly (absent from document.cookie).
  expect(allKeys).not.toContain("controlhub.token");
  expect(allKeys).not.toContain("controlhub.role");
  expect(allValues.join("\n")).not.toContain("Bearer ");
  expect(snapshot.cookieHeader).not.toContain("controlhub.token=");
  expect(snapshot.cookieHeader).not.toContain(SESSION_COOKIE);
}

/**
 * Bearer-exposure assertion for flows that signed in through the real UI:
 * the presentation-only `controlhub.role` state is expected by design, but
 * the Backend Bearer Credential (and any browser-readable token cookie)
 * must never appear in browser storage, readable cookies, or values.
 */
function assertNoBearerExposure(snapshot: {
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
  expect(allKeys).not.toContain("controlhub.token");
  expect(allValues.join("\n")).not.toContain("Bearer ");
  expect(snapshot.cookieHeader).not.toContain("controlhub.token=");
  expect(snapshot.cookieHeader).not.toContain(SESSION_COOKIE);
}

/** Real UI sign-out: console account menu → Sign out (locale-agnostic). */
async function uiSignOut(page: Page) {
  await page.locator('[data-slot="dropdown-menu-trigger"]').click();
  await page
    .getByRole("menuitem", { name: /sign out|退出登录/i })
    .click();
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
        data: { email: FIXTURE.email, password: "wrong-password" },
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
        data: { email: FIXTURE.email, password: FIXTURE.password },
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

    // Sealed session admits the protected route; SSR apiClient unseals the
    // HttpOnly cookie server-side so Overview RSC can load without exposing
    // the bearer credential to browser JS.
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

  test("a valid operator session never sits behind the login page", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/overview/);

    // Direct navigation to /login with a live session redirects to the
    // console — no logged-out presentation over a usable session.
    await page.goto("/login");
    await expect(page).toHaveURL(/\/overview/);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeDefined();
    assertNoBearerExposure(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("legacy controlhub.token alone never admits a protected page (Issue #15 seam removal)", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    // Exact legacy shape: a browser-readable bearer cookie, no Operator
    // Session cookie. The pre-BFF page gate trusted this; the BFF gate
    // must reject it.
    await page.context().addCookies([
      {
        name: "controlhub.token",
        value: "legacy-browser-bearer",
        domain: "localhost",
        path: "/",
        httpOnly: false,
      },
    ]);

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();
    // The legacy token cookie is not cleared (browser storage is not the
    // session authority), but it admits nothing on its own: no session is
    // minted and the browser-held bearer never becomes an auth path.
    const snapshot = await storageSnapshot(page);
    expect(snapshot.cookieHeader).not.toContain(SESSION_COOKIE);
    expect(snapshot.sessionStorageKeys).not.toContain("controlhub.token");
    expect(snapshot.sessionStorageKeys).not.toContain("controlhub.role");
    expect(snapshot.sessionStorageValues.join("\n")).not.toContain("Bearer ");
    assertClean(consoleMessages, networkErrors);
  });

  test("UI sign-out clears the operator session and protected pages require login again", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("nav")).toBeVisible();
    assertNoBearerExposure(await storageSnapshot(page));

    await uiSignOut(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

    // Protected navigation now redirects to login.
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);

    assertNoBearerExposure(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("a failed UI sign-out never presents a logged-out console while the operator session survives", async ({
    page,
    context,
  }) => {
    await loginViaUI(page);
    await expect(page).toHaveURL(/\/overview/);

    // Real network failure: the browser goes offline, then Sign out is
    // clicked. No route mocking — the DELETE genuinely cannot be sent.
    const networkErrors = collectNetworkErrors(page);
    await context.setOffline(true);
    await uiSignOut(page);

    // Controlled failure surfaced in the console menu; no navigation away
    // while the HttpOnly Operator Session cookie is still valid. (Filter by
    // text: Next.js also mounts a route-announcer div with role="alert".)
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: /sign out failed|退出登录失败/i }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/overview/);

    // Back online: the session is the honest remaining state — a reload
    // lands on the console, not the login page.
    await context.setOffline(false);
    await page.reload();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("nav")).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeDefined();
    assertNoBearerExposure(await storageSnapshot(page));

    // Exactly the one sign-out DELETE failed at the network layer (no HTTP
    // status); nothing else went wrong. Offline mode intentionally produces
    // network-layer console noise, so console-message cleanliness is not
    // asserted here.
    const logoutFailures = networkErrors.filter((entry) =>
      entry.includes("/api/operator-session"),
    );
    expect(logoutFailures).toHaveLength(1);
    expect(logoutFailures[0]).toMatch(/DELETE .*api\/operator-session → /);
  });

  test("desktop zh-CN: BFF login, sealed session, reload survival, and UI sign-out", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "zh-CN",
        domain: "localhost",
        path: "/",
      },
    ]);

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/overview/);
    assertNoBearerExposure(await storageSnapshot(page));

    // Valid Operator Sessions survive reloads.
    await page.reload();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("nav")).toBeVisible();

    await uiSignOut(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);
    assertNoBearerExposure(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("375px EN: BFF session survives reload and UI sign-out works on the mobile viewport", async ({
    page,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.setViewportSize({ width: 375, height: 844 });

    await loginViaUI(page);
    await expect(page).toHaveURL(/\/overview/);
    assertNoBearerExposure(await storageSnapshot(page));

    await page.reload();
    await expect(page).toHaveURL(/\/overview/);
    await expect(page.locator("header")).toBeVisible();

    await uiSignOut(page);
    await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === SESSION_COOKIE)).toBeUndefined();

    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);
    assertNoBearerExposure(await storageSnapshot(page));
    assertClean(consoleMessages, networkErrors);
  });

  test("forged, tampered, and expired session cookies fail closed at the page gate", async ({
    page,
    context,
  }) => {
    const consoleMessages = collectConsoleMessages(page);
    const networkErrors = collectNetworkErrors(page);

    await page.goto("/login");
    expect((await bffLoginViaRequest(page)).status).toBe(200);
    const valid = (await context.cookies()).find(
      (cookie) => cookie.name === SESSION_COOKIE,
    );
    expect(valid?.value).toBeTruthy();

    // Forge: replace the sealed value with garbage.
    await context.clearCookies();
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: "v1.deadbeef.not-a-real-session",
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);
    // Localized generic re-login feedback for the rejected session. The
    // forged-cookie setup cleared the locale cookie, so the page may render
    // in the default zh-CN — match both locales.
    await expect(page.getByText(/session ended|会话已结束/i)).toBeVisible();
    const parts = valid!.value.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    await context.clearCookies();
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: parts.join("."),
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);

    // Expired: seal under the same local key with iat/exp nine hours ago.
    const expired = sealSession(
      { token: "expired-token", role: "admin" },
      e2eSessionConfig(),
      Date.now() - 9 * 60 * 60 * 1000,
    );
    await context.clearCookies();
    await context.addCookies([
      {
        name: SESSION_COOKIE,
        value: expired,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    await page.goto("/overview");
    await expect(page).toHaveURL(/\/login\?from=/);

    assertClean(consoleMessages, networkErrors);
  });
});
