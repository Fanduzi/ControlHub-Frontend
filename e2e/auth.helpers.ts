import type { Page } from "@playwright/test";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8081";

const TEST_EMAIL = "admin@example.com";
const TEST_PASSWORD = "secret123";

/**
 * Authenticate via the login API and inject the session token
 * into sessionStorage. Then navigate to a console page so the
 * token is available for subsequent client-side fetches.
 */
export async function loginViaApi(page: Page): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Login API returned ${res.status}: ${await res.text()}`);
  }

  const { token, role } = (await res.json()) as {
    token: string;
    role: string;
  };

  await page.goto("/login");
  // Force English locale via cookie so test assertions match English i18n keys
  await page.context().addCookies([
    {
      name: "controlhub.locale",
      value: "en",
      domain: "localhost",
      path: "/",
    },
  ]);
  await page.evaluate(
    ([t, r]) => {
      window.sessionStorage.setItem("controlhub.token", t);
      window.sessionStorage.setItem("controlhub.role", r);
    },
    [token, role] as const,
  );
}
