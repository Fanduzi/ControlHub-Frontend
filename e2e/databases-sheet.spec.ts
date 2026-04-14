import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

test.describe("Databases detail sheet", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking a database row opens the detail sheet", async ({ page }) => {
    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    test.skip(count === 0, "No database resources seeded in backend");

    await rows.first().click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
  });

  test("detail sheet shows same pattern as resources", async ({ page }) => {
    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    test.skip(count === 0, "No database resources seeded in backend");

    await rows.first().click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Should have summary section
    await expect(sheet.locator("text=Summary").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
