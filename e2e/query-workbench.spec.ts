import { expect, type Page, test } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
} from "./harness/console-guards";

test.describe("Query Workbench shell", () => {
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
      allowedWarnings: [
        /was preloaded using link preload but not used/,
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

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `query-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    assertClean(consoleMessages, networkErrors);
  });

  test("loads with real backend data and an execution-disabled banner", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await expect(page).toHaveURL(/\/query/);
    await expect(
      page.getByRole("heading", { name: /Query Workbench/i }).first(),
    ).toBeVisible();
    // Scope to the safety banner (role="status") with an exact match — the
    // page-header description also contains this phrase, which would otherwise
    // trip Playwright strict mode.
    await expect(
      page
        .getByRole("status")
        .getByText("Query execution is not enabled", { exact: true }),
    ).toBeVisible();
  });

  test("target switcher surfaces at least one database target", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    // The switcher is populated from the backend query-target list.
    await expect(page.locator("#query-target-switcher")).toBeVisible();
    await expect(page.getByText(/\d+ targets/)).toBeVisible();
    await expect(page.getByText("0 targets")).toHaveCount(0);

    // No degenerate ":0" from a missing_connection target — the switcher must
    // carry real backend connection context, not a raw empty host:port.
    await expect(page.getByText(":0")).toHaveCount(0);
  });

  test("a locked query target keeps Run disabled", async ({ page }) => {
    await openQueryWorkbench(page);

    // Robust to a dev-seeded ready target being present: walk the switcher and
    // assert the locked behavior against the first non-ready target found.
    const count = await switcherOptionCount(page);
    let verifiedLocked = false;
    for (let index = 0; index < count; index += 1) {
      await selectSwitcherOption(page, index);
      if (!(await isRunEnabled(page))) {
        // Locked target: the Run control must be disabled and labelled "Run locked".
        await expect(
          page.getByRole("button", { name: /run locked/i }),
        ).toBeDisabled();
        verifiedLocked = true;
        break;
      }
    }
    // If every seeded target happens to be ready, there is no locked target to
    // verify here — skip deterministically rather than fail.
    test.skip(!verifiedLocked, "no locked query target present (every target is ready)");
  });

  test("switching the target updates the governance panel facts", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await openSwitcher(page);

    const options = page.getByRole("option");
    const optionCount = await options.count();

    // Requires a seed with at least two query targets. Skips deterministically
    // otherwise so the suite stays green on single-target seeds.
    test.skip(optionCount < 2, "query workbench E2E needs >= 2 seeded targets");

    const switcher = page.locator("#query-target-switcher");
    const before = await switcher.textContent();

    // Pick a different target than the currently active one.
    await options.nth(1).click();

    const after = await switcher.textContent();
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);

    // Still no degenerate ":0" after switching targets.
    await expect(page.getByText(":0")).toHaveCount(0);
  });

  test("a ready target runs a guarded SELECT and shows the result", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // The worksheet seeds a safe default statement and never auto-runs.
    const statement = page.getByRole("textbox", { name: /statement/i });
    await expect(statement).toHaveValue("select 1");

    await page.getByRole("button", { name: /^run$/i }).click();

    // The backend executes `select 1` and returns a single INT cell.
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("a ready target runs SHOW TABLES and shows the result", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // Replace the default statement with SHOW TABLES.
    const statement = page.getByRole("textbox", { name: /statement/i });
    await statement.fill("SHOW TABLES");

    await page.getByRole("button", { name: /^run$/i }).click();

    // The backend executes SHOW TABLES and returns a result set.
    // The result grid should show at least one row (the table name).
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // The result should contain at least one cell with a table name.
    // We don't assert a specific table name since it depends on the fixture.
    const cells = page.getByRole("gridcell");
    const cellCount = await cells.count();
    expect(cellCount).toBeGreaterThan(0);
  });

  test("a ready target runs DESCRIBE and shows the result", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // First, run SHOW TABLES to discover a table name.
    const statement = page.getByRole("textbox", { name: /statement/i });
    await statement.fill("SHOW TABLES");
    await page.getByRole("button", { name: /^run$/i }).click();

    // Wait for the result grid to show table names.
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Get the first table name from a data cell (not a header).
    // The grid has header rows and data rows; we want a data cell.
    const dataCells = page.getByRole("gridcell");
    const cellCount = await dataCells.count();
    test.skip(cellCount === 0, "SHOW TABLES returned no data cells");

    const tableName = await dataCells.first().textContent();
    test.skip(!tableName, "SHOW TABLES returned empty table name");

    // Now run DESCRIBE on that table.
    await statement.fill(`DESCRIBE ${tableName}`);
    await page.getByRole("button", { name: /^run$/i }).click();

    // Wait for the result grid to update with DESCRIBE output.
    // DESCRIBE returns columns: Field, Type, Null, Key, Default, Extra.
    // We assert that at least one DESCRIBE-specific column header appears,
    // which proves the DESCRIBE result replaced the SHOW TABLES result.
    await expect(
      page.getByRole("columnheader", { name: /Field|Type|Null|Key|Default|Extra/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Additionally verify at least one data row exists (a column definition).
    const describeDataCells = page.getByRole("gridcell");
    const describeCellCount = await describeDataCells.count();
    expect(describeCellCount).toBeGreaterThan(0);
  });

  test("an unsafe statement is rejected with a controlled validation message", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    const statement = page.getByRole("textbox", { name: /statement/i });
    await statement.fill("update resources set name = 'x'");
    await page.getByRole("button", { name: /^run$/i }).click();

    // Controlled rejection: the backend guard rejects the write and the UI
    // surfaces a controlled error (role=alert) instead of result rows.
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  });

  test("query history shows the recent attempt after a run", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // After the run settles, the history tab refreshes and records the attempt
    // (metadata only — the statement preview surfaces, never result rows).
    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("select 1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("query history records SHOW TABLES attempt", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    const statement = page.getByRole("textbox", { name: /statement/i });
    await statement.fill("SHOW TABLES");
    await page.getByRole("button", { name: /^run$/i }).click();

    // Wait for the result to appear.
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Switch to history tab and verify the SHOW TABLES attempt is recorded.
    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SHOW TABLES").first()).toBeVisible({ timeout: 15_000 });
  });
});

async function openQueryWorkbench(page: Page): Promise<void> {
  await loginViaUI(page);
  await page.locator('a[href="/query"]').first().click();
  await expect(page).toHaveURL(/\/query/);
}

/** Whether the active target exposes an enabled Run control (i.e. is ready). */
async function isRunEnabled(page: Page): Promise<boolean> {
  const run = page.getByRole("button", { name: /^run$/i });
  if ((await run.count()) === 0) {
    return false;
  }
  return run.first().isEnabled().catch(() => false);
}

/**
 * Open the target picker popover and wait for its options to render.
 * Phase 38C replaced the Select dropdown with a Command-based searchable picker.
 */
async function openSwitcher(page: Page): Promise<void> {
  // Dismiss any open popover first (Escape closes the popover), then toggle
  // open. Deterministic regardless of prior open/closed state.
  await page.keyboard.press("Escape");
  await page.locator("#query-target-switcher").click();
  // Wait for the Command list to appear with at least one item.
  await expect(page.getByRole("option").first()).toBeVisible({ timeout: 5_000 });
}

async function switcherOptionCount(page: Page): Promise<number> {
  await openSwitcher(page);
  return page.getByRole("option").count();
}

async function selectSwitcherOption(page: Page, index: number): Promise<void> {
  await openSwitcher(page);
  await page.getByRole("option").nth(index).click();
  // Wait for the popover to close after selection.
  await page.waitForTimeout(300);
}

/** Walk the switcher and return the first ready target's option index, or null. */
async function findReadyOptionIndex(page: Page): Promise<number | null> {
  const count = await switcherOptionCount(page);
  for (let index = 0; index < count; index += 1) {
    await selectSwitcherOption(page, index);
    if (await isRunEnabled(page)) {
      return index;
    }
  }
  return null;
}
