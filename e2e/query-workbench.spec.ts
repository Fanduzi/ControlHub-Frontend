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

    // Record the current switcher text before switching.
    const switcher = page.locator("#query-target-switcher");
    const before = await switcher.textContent();

    // Open the picker and get available option names.
    await openSwitcher(page);
    const options = page.getByRole("option");
    const optionCount = await options.count();

    // Requires a seed with at least two query targets.
    test.skip(optionCount < 2, "query workbench E2E needs >= 2 seeded targets");

    // Find and click an option whose text differs from the current selection.
    let clicked = false;
    for (let i = 0; i < optionCount; i += 1) {
      const optionText = await options.nth(i).textContent();
      if (optionText && before && !before.includes(optionText.trim().split("·")[0].trim())) {
        await options.nth(i).click();
        clicked = true;
        break;
      }
    }

    // If all options match the current selection, skip.
    test.skip(!clicked, "all picker options match the current target");

    // Wait for the switcher to update.
    await page.waitForTimeout(500);

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

    // The backend executes SHOW TABLES and returns a result table.
    // The result is rendered as an HTML <table>, not a grid.
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

    // The result should contain at least one cell with a table name.
    const cells = page.getByRole("cell");
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

    // Wait for the result table to show table names.
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

    // Get the first table name from a data cell (not a header).
    const dataCells = page.getByRole("cell");
    const cellCount = await dataCells.count();
    test.skip(cellCount === 0, "SHOW TABLES returned no data cells");

    const tableName = await dataCells.first().textContent();
    test.skip(!tableName, "SHOW TABLES returned empty table name");

    // Now run DESCRIBE on that table.
    await statement.fill(`DESCRIBE ${tableName}`);
    await page.getByRole("button", { name: /^run$/i }).click();

    // Wait for the result table to update with DESCRIBE output.
    // DESCRIBE returns columns: Field, Type, Null, Key, Default, Extra.
    // We assert that at least one DESCRIBE-specific column header appears,
    // which proves the DESCRIBE result replaced the SHOW TABLES result.
    await expect(
      page.getByRole("columnheader", { name: /Field|Type|Null|Key|Default|Extra/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Additionally verify at least one data row exists (a column definition).
    const describeDataCells = page.getByRole("cell");
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

    // Wait for the result table to appear.
    await expect(page.getByRole("table")).toBeVisible({ timeout: 15_000 });

    // Switch to history tab and verify the SHOW TABLES attempt is recorded.
    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SHOW TABLES").first()).toBeVisible({ timeout: 15_000 });
  });

  test("Format button visibly formats messy SQL", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // Type messy SQL into the CodeMirror editor
    const editor = page.locator(".cm-content");
    await editor.click();
    // Select all and replace with messy SQL
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+a" : "Control+a");
    await page.keyboard.type("select id,name from query_e2e_items where id=1");

    // Click Format button
    await page.getByRole("button", { name: /format/i }).click();

    // Wait for formatting to apply
    await page.waitForTimeout(500);

    // Verify formatted SQL contains uppercase keywords
    const content = await page.evaluate(() => {
      const cm = document.querySelector(".cm-content");
      return cm?.textContent ?? "";
    });
    expect(content).toContain("SELECT");
    expect(content).toContain("FROM");
  });

  test("Cmd/Ctrl+Enter runs the active worksheet", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // Focus the CodeMirror editor
    const editor = page.locator(".cm-content");
    await editor.click();

    // Press Cmd+Enter (Mac) or Ctrl+Enter (other platforms)
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+Enter" : "Control+Enter");

    // Should execute the default select 1 and show the result
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("two worksheets keep separate statements and results", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // Worksheet 1: run the default SELECT 1
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Add Worksheet 2
    await page.getByRole("button", { name: /add worksheet/i }).click();

    // Worksheet 2 should have its own editor visible
    const editor2 = page.locator(".cm-content");
    await expect(editor2).toBeVisible();

    // Switch back to Worksheet 1
    await page.getByRole("tab", { name: /worksheet 1/i }).click();

    // Worksheet 1 should still show its result
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  });

  test("unsafe SQL remains rejected by backend", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectSwitcherOption(page, readyIndex);

    // Type unsafe SQL into the CodeMirror editor
    const editor = page.locator(".cm-content");
    await editor.click();
    // Select all and replace with unsafe SQL
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+a" : "Control+a");
    await page.keyboard.type("update resources set name = 'x'");

    // Run it
    await page.getByRole("button", { name: /^run$/i }).click();

    // Should show controlled rejection via alert
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
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
