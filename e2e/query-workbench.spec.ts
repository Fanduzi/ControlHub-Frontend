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

  test("loads with real backend data and a governed-execution banner", async ({ page }) => {
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
        .getByText("Governed query execution", { exact: true }),
    ).toBeVisible();
  });

  test("connection navigator surfaces at least one database target", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await expect(getConnectionNavigator(page)).toBeVisible();
    await expect(getConnectionTargetButtons(page).first()).toBeVisible();
    expect(await connectionTargetCount(page)).toBeGreaterThan(0);

    // No degenerate ":0" from a missing_connection target — the switcher must
    // carry real backend connection context, not a raw empty host:port.
    await expect(page.getByText(":0")).toHaveCount(0);
  });

  test("a locked query target hides Run and shows the blocker state", async ({ page }) => {
    await openQueryWorkbench(page);

    const count = await connectionTargetCount(page);
    let verifiedLocked = false;
    for (let index = 0; index < count; index += 1) {
      await selectConnectionTarget(page, index);
      if (!(await isRunEnabled(page))) {
        await expect(page.getByRole("button", { name: /^run$/i })).toHaveCount(0);
        await expect(page.getByText("Editor locked by policy")).toBeVisible();
        await expect(page.getByText("Result area is locked")).toBeVisible();
        await expect(page.getByRole("heading", { name: "Blocker" })).toBeVisible();
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

    const activeSummary = page.getByRole("region", { name: "Active connection" });
    const before = await activeSummary.textContent();
    const options = getInactiveConnectionTargetButtons(page);
    const optionCount = await options.count();

    // Requires a seed with at least two query targets.
    test.skip(optionCount < 1, "query workbench E2E needs >= 2 seeded targets");

    await options.first().click();

    const after = await activeSummary.textContent();
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
    await selectConnectionTarget(page, readyIndex);

    // The worksheet seeds a safe default statement and never auto-runs.
    const content = await getEditorContent(page);
    expect(content).toContain("select 1");

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
    await selectConnectionTarget(page, readyIndex);

    // Replace the default statement with SHOW TABLES.
    await clearAndType(page, "SHOW TABLES");

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
    await selectConnectionTarget(page, readyIndex);

    // First, run SHOW TABLES to discover a table name.
    await clearAndType(page, "SHOW TABLES");
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
    await clearAndType(page, `DESCRIBE ${tableName}`);
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
    await selectConnectionTarget(page, readyIndex);

    await clearAndType(page, "update resources set name = 'x'");
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
    await selectConnectionTarget(page, readyIndex);

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
    await selectConnectionTarget(page, readyIndex);

    await clearAndType(page, "SHOW TABLES");
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
    await selectConnectionTarget(page, readyIndex);

    // Type messy SQL into the CodeMirror editor
    await clearAndType(page, "select id,name from query_e2e_items where id=1");

    // Click Format button
    await page.getByRole("button", { name: /format/i }).click();

    // Wait for formatting to apply
    await page.waitForTimeout(500);

    // Verify formatted SQL contains uppercase keywords
    const content = await getEditorContent(page);
    expect(content).toContain("SELECT");
    expect(content).toContain("FROM");
  });

  test("Cmd/Ctrl+Enter runs the active worksheet", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    // Focus the CodeMirror editor and press Cmd/Ctrl+Enter
    const editor = getEditor(page);
    await editor.click();
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
    await selectConnectionTarget(page, readyIndex);

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
    await selectConnectionTarget(page, readyIndex);

    // Type unsafe SQL into the CodeMirror editor
    await clearAndType(page, "update resources set name = 'x'");

    // Run it
    await page.getByRole("button", { name: /^run$/i }).click();

    // Should show controlled rejection via alert
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  });

  test("dark-mode editor and result table maintain readable contrast", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    await setThemeToDark(page);

    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const contrast = await page.evaluate(() => {
      function relativeLuminance([r, g, b]: number[]) {
        const channel = [r, g, b].map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2];
      }
      function contrastRatio(rgb1: number[], rgb2: number[]) {
        const l1 = relativeLuminance(rgb1) + 0.05;
        const l2 = relativeLuminance(rgb2) + 0.05;
        return Math.max(l1, l2) / Math.min(l1, l2);
      }
      function parseRgb(color: string): number[] | null {
        const rgb = color.match(/rgba?\(\s*(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
        if (rgb) {
          return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
        }

        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return null;

        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      }
      function effectiveBackground(element: Element): string {
        let el: Element | null = element;
        while (el) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") return bg;
          el = el.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      }

      const editor = document.querySelector(".cm-content");
      const resultCell = document.querySelector("table tbody td");
      const resultHeader = document.querySelector("table thead th");

      const editorFg = editor ? parseRgb(getComputedStyle(editor).color) : null;
      const editorBg = editor ? parseRgb(effectiveBackground(editor)) : null;
      const cellFg = resultCell ? parseRgb(getComputedStyle(resultCell).color) : null;
      const cellBg = resultCell ? parseRgb(effectiveBackground(resultCell)) : null;
      const headerFg = resultHeader ? parseRgb(getComputedStyle(resultHeader).color) : null;
      const headerBg = resultHeader ? parseRgb(effectiveBackground(resultHeader)) : null;

      return {
        editor: editorFg && editorBg ? contrastRatio(editorFg, editorBg) : 0,
        cell: cellFg && cellBg ? contrastRatio(cellFg, cellBg) : 0,
        header: headerFg && headerBg ? contrastRatio(headerFg, headerBg) : 0,
      };
    });

    expect(contrast.editor).toBeGreaterThanOrEqual(4.5);
    expect(contrast.cell).toBeGreaterThanOrEqual(4.5);
    expect(contrast.header).toBeGreaterThanOrEqual(4.5);
  });

  test("SQL editor resize handle persists height across reload", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    const initialHeight = await getEditorHeight(page);
    expect(initialHeight).toBeGreaterThan(0);

    const handle = page.getByRole("separator", { name: "Resize SQL editor" });
    await handle.scrollIntoViewIfNeeded();
    const box = await handle.boundingBox();
    expect(box).toBeTruthy();

    const targetY = box!.y + 120;
    await page.mouse.move(box!.x + box!.width / 2, box!.y);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2, targetY, { steps: 10 });
    await page.mouse.up();

    const resizedHeight = await getEditorHeight(page);
    expect(resizedHeight).toBeGreaterThan(initialHeight + 50);

    await page.reload();
    await expect(page.getByRole("button", { name: /^run$/i })).toBeVisible({ timeout: 15_000 });

    await expect
      .poll(() => getEditorHeight(page), { timeout: 15_000 })
      .toBe(resizedHeight);
  });
});

async function openQueryWorkbench(page: Page): Promise<void> {
  await loginViaUI(page);
  await page.locator('a[href="/query"]').first().click();
  await expect(page).toHaveURL(/\/query/);
}

/** Get the CodeMirror editor content element. */
function getEditor(page: Page) {
  return page.locator(".cm-content");
}

/** Get the current text content of the CodeMirror editor. */
async function getEditorContent(page: Page): Promise<string> {
  return page.evaluate(() => {
    const cm = document.querySelector(".cm-content");
    return cm?.textContent ?? "";
  });
}

/** Clear the editor and type new content. */
async function clearAndType(page: Page, text: string): Promise<void> {
  const editor = getEditor(page);
  await editor.click();
  const isMac = process.platform === "darwin";
  await page.keyboard.press(isMac ? "Meta+a" : "Control+a");
  await page.keyboard.type(text);
}

/** Whether the active target exposes an enabled Run control (i.e. is ready). */
async function isRunEnabled(page: Page): Promise<boolean> {
  const run = page.getByRole("button", { name: /^run$/i });
  if ((await run.count()) === 0) {
    return false;
  }
  return run.first().isEnabled().catch(() => false);
}

function getConnectionNavigator(page: Page) {
  return page.getByRole("complementary", { name: "Connections" });
}

function getConnectionTargetButtons(page: Page) {
  return getConnectionNavigator(page).locator('ul button[aria-label]');
}

function getInactiveConnectionTargetButtons(page: Page) {
  return getConnectionNavigator(page).locator(
    'ul button[aria-label]:not([aria-current="true"])',
  );
}

async function connectionTargetCount(page: Page): Promise<number> {
  await expect(getConnectionTargetButtons(page).first()).toBeVisible({ timeout: 5_000 });
  return getConnectionTargetButtons(page).count();
}

async function selectConnectionTarget(page: Page, index: number): Promise<void> {
  const target = getConnectionTargetButtons(page).nth(index);
  await expect(target).toBeVisible({ timeout: 5_000 });
  await target.click();
}

async function findReadyOptionIndex(page: Page): Promise<number | null> {
  const count = await connectionTargetCount(page);
  for (let index = 0; index < count; index += 1) {
    await selectConnectionTarget(page, index);
    if (await isRunEnabled(page)) {
      return index;
    }
  }
  return null;
}

async function setThemeToDark(page: Page): Promise<void> {
  let isDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  if (isDark) return;

  const toggle = page.getByRole("button", { name: /theme/i });
  for (let i = 0; i < 3; i += 1) {
    await toggle.click();
    await page.waitForTimeout(150);
    isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (isDark) break;
  }

  expect(isDark).toBe(true);
}

async function getEditorHeight(page: Page): Promise<number> {
  return page.evaluate(() => {
    const editor = document.querySelector(".cm-editor") as HTMLElement | null;
    if (!editor) return 0;
    return Math.round(editor.getBoundingClientRect().height);
  });
}
