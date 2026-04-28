import { expect, test } from "@playwright/test";

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
    // Uses real backend POST /auth/login through the api-proxy (localhost:8081).
    // No route stub — the seeded admin@example.com / secret123 account is used.
    await page.goto("/login");

    await page.locator("#email").fill("admin@example.com");
    await page.locator("#password").fill("secret123");
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL(/\/overview/, { timeout: 15_000 });
    await expect(page.locator("nav")).toBeVisible();
  });

  test("rejects invalid credentials", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill("admin@example.com");
    await page.locator("#password").fill("wrong-password");
    await page.locator('button[type="submit"]').click();

    // Should stay on login page (either error text or redirect back)
    await expect(page).toHaveURL(/\/login/, { timeout: 5_000 });
  });
});
