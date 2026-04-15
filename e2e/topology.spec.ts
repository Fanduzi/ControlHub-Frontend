import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

test.describe("Resource topology view", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("topology section renders on resource detail page with graph", async ({ page }) => {
    // Navigate to resources list
    await page.goto("/resources");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Click the first resource row
    const firstRow = page.locator("table").first().locator("tbody tr").first();
    await firstRow.click();

    // Open the full detail page from the sheet
    const sheet = page.locator('[data-slot="sheet-content"]');
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("link", { name: /open full detail/i }).click();
    await expect(page).toHaveURL(/\/resources\/[\w-]+/);

    // Verify the topology section exists
    await expect(page.getByText("Resource topology").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify topology graph is rendered (real backend returns data)
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify at least one topology node is visible
    const topologyNodes = page.locator("[data-testid^='topology-node-']");
    await expect(topologyNodes.first()).toBeVisible({ timeout: 10_000 });
    const nodeCount = await topologyNodes.count();
    expect(nodeCount).toBeGreaterThanOrEqual(1);
  });

  test("topology depth selector updates graph", async ({ page }) => {
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

    // Wait for graph to load
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Verify depth and direction selectors exist
    await expect(page.getByTestId("topology-depth-select").first()).toBeVisible();
    await expect(page.getByTestId("topology-direction-select").first()).toBeVisible();

    // Change depth to 2
    await page.getByTestId("topology-depth-select").first().click();
    await page.getByTestId("topology-depth-2").click();

    // Graph should reload and still be visible
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("topology direction selector switches direction", async ({ page }) => {
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

    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });

    // Switch direction to upstream
    await page.getByTestId("topology-direction-select").first().click();
    await page.getByTestId("topology-direction-upstream").click();

    // Graph should reload and still be visible
    await expect(page.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
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

    // With real backend, topology graph should render in compact mode
    await expect(sheet.getByTestId("topology-graph").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
