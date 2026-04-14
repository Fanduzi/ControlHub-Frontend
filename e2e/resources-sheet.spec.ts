import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

test.describe("Resources detail sheet", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto("/resources");
    // Wait for the resource table data to load (use first() for strict mode)
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("renders live resource rows from backend", async ({ page }) => {
    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("clicking a resource row opens the detail sheet", async ({ page }) => {
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
  });

  test("detail sheet shows backend profile data", async ({ page }) => {
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Sheet should contain the profile section heading
    await expect(sheet.locator("text=Operational profile").first()).toBeVisible(
      { timeout: 10_000 },
    );
  });
});
