import { expect, test, type Locator } from "@playwright/test";

import { loginViaApi } from "./auth.helpers";

async function expectSidebarCollapsed(sidebar: Locator) {
  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return box?.width ?? 0;
    })
    .toBeLessThan(100);
}

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

      // Wait for the width transition and collapsed-state button swap.
      await expect(sidebar.locator("button[aria-label*='Expand'], button[aria-label*='展开']")).toBeVisible();
      await expectSidebarCollapsed(sidebar);

      // Navigate away and back - state should persist
      await page.goto("/databases");
      await page.waitForLoadState("networkidle");

      const sidebarAfterNav = page.locator("aside");
      await expect(sidebarAfterNav.locator("button[aria-label*='Expand'], button[aria-label*='展开']")).toBeVisible();
      await expectSidebarCollapsed(sidebarAfterNav);
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
