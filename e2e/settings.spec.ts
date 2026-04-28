import { expect, test } from "@playwright/test";

import { loginViaUI } from "./harness/auth";

test.describe("Settings page", () => {
  test.beforeEach(async ({ page }) => {
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.locator('a[href="/settings"]').first().click();
    // Wait for page to render (any heading)
    await expect(page.locator("h1, h2, h3").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("loads environments from backend", async ({ page }) => {
    const envSection = page.getByText("Environments").first();
    await expect(envSection).toBeVisible();

    const bodyText = await page.locator("body").textContent();
    const hasEnv =
      bodyText?.includes("Production") ||
      bodyText?.includes("Staging") ||
      bodyText?.includes("Development");
    expect(hasEnv).toBeTruthy();
  });

  test("loads owners from backend", async ({ page }) => {
    const ownerSection = page.getByText("Owners").first();
    await expect(ownerSection).toBeVisible();
  });

  test("loads roles from backend", async ({ page }) => {
    const roleSection = page.getByText("Roles").first();
    await expect(roleSection).toBeVisible();
  });

  test("loads dictionaries from backend", async ({ page }) => {
    const dictSection = page.getByText("Dictionaries").first();
    await expect(dictSection).toBeVisible();

    const bodyText = await page.locator("body").textContent();
    const hasDictValues =
      bodyText?.includes("resourceType") ||
      bodyText?.includes("relationType") ||
      bodyText?.includes("lifecycleStatus") ||
      bodyText?.includes("healthStatus");
    expect(hasDictValues).toBeTruthy();
  });
});
