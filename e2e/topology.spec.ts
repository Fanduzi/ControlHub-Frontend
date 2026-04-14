import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

test.describe("Resource topology view", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("topology section renders on resource detail page", async ({ page }) => {
    // Navigate to resources list
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click the first resource row to get its ID
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    // Open the full detail page from the sheet
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Click "Open full detail" link
    await sheet.getByRole("link", { name: /open full detail/i }).click();

    // Wait for the detail page to load
    await expect(page).toHaveURL(/\/resources\/[\w-]+/);

    // Verify the topology section exists
    await expect(page.getByText("Resource topology").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology section shows unavailable state when backend endpoint missing", async ({
    page,
  }) => {
    // Navigate directly to a known resource detail page
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Get the first row and navigate to detail
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("link", { name: /open full detail/i }).click();
    await expect(page).toHaveURL(/\/resources\/[\w-]+/);

    // Since backend Phase 11 is not deployed, topology should show unavailable state
    await expect(page.getByTestId("topology-unavailable").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology depth selector is present on detail page", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("link", { name: /open full detail/i }).click();
    await expect(page).toHaveURL(/\/resources\/[\w-]+/);

    // Verify the depth and direction selectors exist
    await expect(page.getByTestId("topology-depth-select").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByTestId("topology-direction-select").first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("topology renders in detail sheet with compact view", async ({ page }) => {
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });

    // Verify topology section exists inside the sheet
    await expect(sheet.getByText("Resource topology").first()).toBeVisible({
      timeout: 10_000,
    });

    // Since backend is unavailable, the unavailable state should show
    await expect(sheet.getByTestId("topology-unavailable").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
