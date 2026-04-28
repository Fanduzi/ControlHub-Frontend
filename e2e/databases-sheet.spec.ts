import { expect, test } from "@playwright/test";

import { loginViaUI } from "./harness/auth";

test.describe("Databases detail sheet", () => {
  test.describe.configure({ mode: "serial" });

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
    await page.locator('a[href="/databases"]').first().click();
    await expect(page).toHaveURL(/\/databases/, { timeout: 15_000 });
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
    const rows = page.locator("table").first().locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
  });

  test("clicking a database row opens the detail sheet", async ({ page }) => {
    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    test.skip(count === 0, "No database resources seeded in backend");

    // Click the third cell (engine/type) to avoid:
    // - first cell: expander button (stopPropagation)
    // - second cell: ResourceLink (stopPropagation, navigates to detail page)
    await rows.first().locator("td").nth(2).click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
  });

  test("detail sheet shows same pattern as resources", async ({ page }) => {
    const rows = page.locator("table").first().locator("tbody tr");
    const count = await rows.count();
    test.skip(count === 0, "No database resources seeded in backend");

    await rows.first().locator("td").nth(2).click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    await expect(sheet.locator("text=Summary").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
