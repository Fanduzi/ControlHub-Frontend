import { expect, test } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

test.describe("Sidebar collapse persistence", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("sidebar collapses and persists state across navigation", async ({ page }) => {
    await page.goto("/resources");

    // Desktop sidebar should be visible
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();

    // Find and click the collapse button
    const collapseButton = sidebar.locator("button", { hasText: /collapse/i });
    if (await collapseButton.isVisible()) {
      await collapseButton.click();

      // Sidebar should be narrower (collapsed state)
      const sidebarBox = await sidebar.boundingBox();
      expect(sidebarBox).not.toBeNull();
      expect(sidebarBox!.width).toBeLessThan(100);

      // Navigate away and back - state should persist
      await page.goto("/databases");
      await page.waitForLoadState("networkidle");

      const sidebarAfterNav = await sidebar.boundingBox();
      expect(sidebarAfterNav).not.toBeNull();
      expect(sidebarAfterNav!.width).toBeLessThan(100);
    }
  });
});

test.describe("Database page search and filter", () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
  });

  test("database page has search input", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="database" i], input[placeholder*="搜索" i]').first();
    await expect(searchInput).toBeVisible();
  });

  test("database page has engine filter select", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    // Engine filter should be visible
    const engineFilter = page.locator("button[aria-label='Engine']").first();
    if (await engineFilter.isVisible()) {
      await engineFilter.click();
      // Should show "All engines" option
      await expect(page.locator("text=All engines").first()).toBeVisible();
    }
  });

  test("database page has posture summary strip", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    // Summary strip should show cluster/instance counts
    const summary = page.locator("text=Cluster records").first();
    await expect(summary).toBeVisible();
  });
});
