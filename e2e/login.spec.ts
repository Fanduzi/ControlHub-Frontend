// input: @playwright/test, ./harness/fixtures
// output: login form E2E — valid fixture identity navigates to overview;
// invalid password stays on login
// pos: real-browser login form coverage against the live backend
// note: if this file changes, update header and e2e/README.md
import { expect, test } from "@playwright/test";

import { resolveFixtureIdentity } from "./harness/fixtures";

const FIXTURE = resolveFixtureIdentity("admin");

test.describe("Login", () => {
  test.beforeEach(async ({ page }) => {
    // Force English locale so test assertions match English i18n keys
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test("submits valid credentials and navigates to overview", async ({
    page,
  }) => {
    // Uses the real backend through the BFF login (localhost:3100 → api-proxy).
    // No route stub — the provisioned per-run fixture operator is used.
    await page.goto("/login");

    await page.locator("#email").fill(FIXTURE.email);
    await page.locator("#password").fill(FIXTURE.password);
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });
    await expect(page.locator("nav")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill(FIXTURE.email);
    await page.locator("#password").fill("wrong-password");
    await page.locator('button[type="submit"]').click();

    // Should stay on login page (either error text or redirect back)
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
