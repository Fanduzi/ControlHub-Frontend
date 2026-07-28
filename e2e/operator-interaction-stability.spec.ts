import { expect, test } from "@playwright/test";

import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";
import {
  setAccentToPurple,
  assertAccentIsPurple,
  assertNoResidualOverlays,
  assertRowClickOpensSheet,
  assertBlankClickClosesSheet,
  assertMultiSelectOpens,
} from "./harness/interaction-stability";

test.describe("Interaction stability QA gate", () => {
  let consoleMessages: ReturnType<typeof collectConsoleMessages>;
  let networkErrors: string[];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
      ],
    });
    networkErrors = collectNetworkErrors(page);

    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
  });

  test.afterEach(async () => {
    assertClean(consoleMessages, networkErrors);
  });

  test("resources: name link → detail → Back → interactions stable", async ({
    page,
  }) => {
    await loginViaUI(page);

    await page.goto("/resources?environment=prod&page=1");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await setAccentToPurple(page);
    // Reload so the accent provider picks up localStorage
    await page.reload();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
    await assertAccentIsPurple(page);

    // Click the first resource name link in the table
    const nameLink = page.locator("table tbody tr td a").first();
    await expect(nameLink).toBeVisible();
    const href = await nameLink.getAttribute("href");
    expect(href).toMatch(/\/resources\/\d+/);
    await nameLink.click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });

    // Browser Back
    await page.goBack();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Assert all invariants
    await assertAccentIsPurple(page);
    await assertNoResidualOverlays(page);
    await assertRowClickOpensSheet(page);
    await assertBlankClickClosesSheet(page);
    await assertMultiSelectOpens(page);
  });

  test("resources: sheet → Open full detail → Back → interactions stable", async ({
    page,
  }) => {
    await loginViaUI(page);

    await page.goto("/resources?environment=prod&page=1");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await setAccentToPurple(page);
    await page.reload();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
    await assertAccentIsPurple(page);

    // Click a table row to open sheet
    await assertRowClickOpensSheet(page);

    // Click "Open full detail" link inside the sheet
    const fullDetailLink = page
      .locator('[data-slot="sheet-content"]')
      .locator("a", { hasText: "Open full detail" });
    await expect(fullDetailLink).toBeVisible();
    await fullDetailLink.click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });

    // Browser Back
    await page.goBack();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Assert all invariants
    await assertAccentIsPurple(page);
    await assertNoResidualOverlays(page);
    await assertRowClickOpensSheet(page);
    await assertBlankClickClosesSheet(page);
    await assertMultiSelectOpens(page);
  });

  test("databases: filter → sheet close → name link → Back → interactions stable", async ({
    page,
  }) => {
    await loginViaUI(page);

    await page.goto("/databases?environment=prod&page=1");
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    await setAccentToPurple(page);
    await page.reload();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });
    await assertAccentIsPurple(page);

    // Open engine multi-select and choose mysql
    const engineTrigger = page
      .locator('[data-slot="multi-select-trigger"]')
      .filter({ hasText: /engine/i })
      .first();
    await expect(engineTrigger).toBeVisible();
    await engineTrigger.click();

    const mysqlOption = page
      .locator('[data-slot="dropdown-menu-checkbox-item"]')
      .filter({ hasText: /mysql/i });
    if (await mysqlOption.isVisible()) {
      await mysqlOption.click();
      // Wait for URL to update
      await expect(page).toHaveURL(/resourceSubtype=mysql/, { timeout: 5_000 });
    }

    // Assert menu closed — press Escape to ensure dropdown dismisses, then verify.
    const menuContent = page.locator('[data-slot="dropdown-menu-content"]');
    if (await menuContent.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.keyboard.press("Escape");
    }
    await expect(menuContent).not.toBeVisible({ timeout: 5_000 });

    // Click database row to open sheet
    await assertRowClickOpensSheet(page);

    // Blank-click close sheet
    await assertBlankClickClosesSheet(page);

    // Click the first database resource name link
    const nameLink = page.locator("table tbody tr td a").first();
    await expect(nameLink).toBeVisible();
    await nameLink.click();

    await expect(page).toHaveURL(/\/resources\/\d+/, { timeout: 10_000 });

    // Browser Back
    await page.goBack();
    await expect(page.locator("table").first()).toBeVisible({
      timeout: 15_000,
    });

    // Assert all invariants
    await assertAccentIsPurple(page);
    await assertNoResidualOverlays(page);
    await assertRowClickOpensSheet(page);
    await assertBlankClickClosesSheet(page);
    await assertMultiSelectOpens(page);
  });
});
