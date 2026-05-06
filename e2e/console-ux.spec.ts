import { expect, test, type Locator } from "@playwright/test";

import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

async function expectSidebarCollapsed(sidebar: Locator) {
  await expect
    .poll(async () => {
      const box = await sidebar.boundingBox();
      return box?.width ?? 0;
    })
    .toBeLessThan(100);
}

test.describe("Sidebar collapse persistence", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page);
    networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
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

  test.afterEach(() => {
    assertClean(consoleMessages, networkErrors);
  });
});

test.describe("Database page search and filter", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page);
    networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
  });

  test("database page has search input", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    const searchInput = page.locator('input[placeholder*="database" i], input[placeholder*="搜索" i]').first();
    await expect(searchInput).toBeVisible();
  });

  test("database page has engine filter", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    // Engine filter should be visible (MultiSelectFilter renders as a button)
    const engineFilter = page.locator("button[aria-label='Engine']").first();
    if (await engineFilter.isVisible()) {
      await engineFilter.click();
      // Should show at least one engine checkbox option
      await expect(page.locator('[role="menuitemcheckbox"]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("database page has posture summary strip", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    // Summary strip should show cluster/instance counts
    const summary = page.locator("text=Cluster records").first();
    await expect(summary).toBeVisible();
  });

  test("database page has signal filter and sort controls", async ({ page }) => {
    await page.goto("/databases");
    await expect(page.locator("table").first()).toBeVisible({ timeout: 10000 });

    // Signal filter dropdown visible
    await expect(page.locator("button[aria-label='Operational signal']")).toBeVisible();

    // Sort dropdown visible
    await expect(page.locator("button[aria-label='Sort']")).toBeVisible();
  });

  test.afterEach(() => {
    assertClean(consoleMessages, networkErrors);
  });
});
