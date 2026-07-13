import { expect, type Page, test } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
  takeExpectedConsoleStatusError,
  takeExpectedNetworkError,
  type ConsoleMessage,
  type ExpectedHttpError,
} from "./harness/console-guards";

/**
 * Intentional HTTP errors consumed one-shot after the test body asserts them.
 * Never a broad allowlist — each entry removes exactly one matching network
 * error; leftovers still fail assertClean.
 */
type ConsumableHttpExpectation = ExpectedHttpError & {
  /** Also drop one Chromium console echo for this status if present. */
  consumeConsoleStatusEcho?: boolean;
};

test.describe("Query Workbench shell", () => {
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];
  /** Exact one-shot expectations set by individual tests (empty by default). */
  let consumableHttpErrors: ConsumableHttpExpectation[] = [];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consumableHttpErrors = [];
    // Default guards: only harmless dev-tool noise. No 4xx/5xx/connection allowlist.
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

    let remainingNetwork = networkErrors;
    let remainingConsole = consoleMessages;
    for (const expected of consumableHttpErrors) {
      remainingNetwork = takeExpectedNetworkError(remainingNetwork, {
        method: expected.method,
        url: expected.url,
        status: expected.status,
      });
      if (expected.consumeConsoleStatusEcho) {
        remainingConsole = takeExpectedConsoleStatusError(
          remainingConsole,
          expected.status,
        );
      }
    }
    assertClean(remainingConsole, remainingNetwork);
  });

  test("loads with real backend data and inline governance controls", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    await expect(page).toHaveURL(/\/query/);
    await expect(
      page.getByRole("region", { name: "Governance & access" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Governance & access Details" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open connections" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Objects", exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("complementary", { name: "Connections" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("complementary", { name: "Governance & access" }),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("status")
        .getByText("Governed query execution", { exact: true }),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Governance & access Details" })
      .click();
    const governanceDialog = page.getByRole("dialog", {
      name: "Governance & access",
    });
    await expect(governanceDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(governanceDialog).toBeHidden();
  });

  test("connection navigator surfaces at least one database target", async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();

    const connectionDialog = await openConnectionNavigator(page);
    await expect(getConnectionTargetButtons(page).first()).toBeVisible();
    expect(await connectionTargetCount(page)).toBeGreaterThan(0);

    // No degenerate ":0" from a missing_connection target — the switcher must
    // carry real backend connection context, not a raw empty host:port.
    await expect(page.getByText(":0")).toHaveCount(0);
    await expect(connectionDialog).toBeVisible();
  });

  test("connection navigator opens as a mobile bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);

    await expect(
      page.getByRole("button", { name: "Open connections", exact: true }),
    ).toBeHidden();
    const mobileTrigger = page.getByRole("button", {
      name: "Open connections on mobile",
    });
    await expect(mobileTrigger).toBeVisible();
    await mobileTrigger.click();

    const connectionSheet = page.getByRole("dialog", { name: "Connections" });
    await expect(connectionSheet).toBeVisible();
    await expect(
      connectionSheet.getByRole("textbox", { name: /search by name/i }),
    ).toBeFocused();
    await expect(getConnectionTargetButtons(page).first()).toBeVisible();
    const sheetBox = await connectionSheet.boundingBox();
    expect(sheetBox).not.toBeNull();
    if (sheetBox === null) return;
    expect(sheetBox.y + sheetBox.height).toBeGreaterThanOrEqual(840);

    await page.keyboard.press("Escape");
    await expect(connectionSheet).toBeHidden();
  });

  test("Chinese query intro keeps the read-only credential phrase on one line", async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 844 });
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "zh-CN",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.goto("/query");

    const phrase = page.getByRole("main").getByText("只读已强制", { exact: true });
    await expect(phrase).toBeVisible();
    await expect(phrase).toHaveCSS("white-space", "nowrap");
    await expect
      .poll(() => phrase.evaluate((element) => element.getClientRects().length))
      .toBe(1);
  });

  test("a locked query target hides Run and shows the blocker state", async ({ page }) => {
    await openQueryWorkbench(page);

    // Product fix: locked targets must not issue schema requests, so no 403
    // allowlist is required. Guards fail on any unexpected 4xx/5xx/connection.

    const count = await connectionTargetCount(page);
    let verifiedLocked = false;
    for (let index = 0; index < count; index += 1) {
      await selectConnectionTarget(page, index);
      if (!(await isRunEnabled(page))) {
        await expect(page.getByRole("button", { name: /^run$/i })).toHaveCount(0);
        await expect(page.getByText("Editor locked by policy")).toBeVisible();
        await expect(page.getByText("Result area is locked")).toBeVisible();
        // Only Grid is discoverable — no placeholder result tabs.
        await expect(page.getByText("Result grid", { exact: true })).toBeVisible();
        await expect(page.getByRole("tab", { name: /^json$/i })).toHaveCount(0);
        await expect(page.getByRole("tab", { name: /^explain$/i })).toHaveCount(0);
        await expect(page.getByRole("tab", { name: /^logs$/i })).toHaveCount(0);
        await expect(page.getByRole("tab", { name: /^masking$/i })).toHaveCount(0);
        await page
          .getByRole("button", { name: "Governance & access Details" })
          .click();
        const governanceDialog = page.getByRole("dialog", {
          name: "Governance & access",
        });
        await expect(governanceDialog).toBeVisible();
        await expect(
          governanceDialog.getByText("Policy checklist"),
        ).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(governanceDialog).toBeHidden();
        verifiedLocked = true;
        break;
      }
    }
    // If every seeded target happens to be ready, there is no locked target to
    // verify here — skip deterministically rather than fail.
    test.skip(!verifiedLocked, "no locked query target present (every target is ready)");
  });

  test("switching the target updates the governance panel facts", async ({ page }) => {
    await openQueryWorkbench(page);

    // Switching targets must not emit unsolicited schema 403s (UI gates schema
    // fetches on availableActions.run). No network allowlist.

    const targetName = page.locator('span[title]').first();
    const before = await targetName.textContent();
    await openConnectionNavigator(page);
    const options = getInactiveConnectionTargetButtons(page);
    const optionCount = await options.count();

    test.skip(optionCount < 1, "query workbench E2E needs >= 2 seeded targets");

    await options.first().click();
    await expect(getConnectionDialog(page)).toBeHidden();

    await expect
      .poll(async () => targetName.textContent(), { timeout: 5_000 })
      .not.toBe(before);

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

    // Exact target-specific execute URL after the ready target is selected.
    const expectedExecuteUrl = await exactExecuteUrlForActiveTarget(page);

    // One exact POST to this target's /execute → 400 only — consumed one-shot.
    // Another target's execute 400, a second 400, 403, 500, or connection failure
    // still fail the guards.
    const executePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url() === expectedExecuteUrl &&
        res.status() === 400,
    );

    await clearAndType(page, "update resources set name = 'x'");
    await page.getByRole("button", { name: /^run$/i }).click();

    const response = await executePromise;
    expect(response.status()).toBe(400);
    expect(response.request().method()).toBe("POST");
    expect(response.url()).toBe(expectedExecuteUrl);
    const body = await response.json();
    expect(body.error).toBeTruthy();

    consumableHttpErrors = [
      {
        method: "POST",
        url: expectedExecuteUrl,
        status: 400,
        consumeConsoleStatusEcho: true,
      },
    ];

    // Controlled rejection: the UI surfaces a controlled error (role=alert)
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
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

    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible({
      timeout: 15_000,
    });

    const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
    const activeTabName = await activeTab.textContent();

    await page.getByRole("button", { name: /add worksheet/i }).click();

    const editor2 = page.locator(".cm-content");
    await expect(editor2).toBeVisible();

    await page.getByRole("tab", { name: activeTabName!, exact: true }).click();

    await expect(page.getByRole("cell", { name: "1", exact: true })).toBeVisible();
  });

  test("unsafe SQL remains rejected by backend", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    const expectedExecuteUrl = await exactExecuteUrlForActiveTarget(page);

    const executePromise = page.waitForResponse(
      (res) =>
        res.request().method() === "POST" &&
        res.url() === expectedExecuteUrl &&
        res.status() === 400,
    );

    await clearAndType(page, "update resources set name = 'x'");
    await page.getByRole("button", { name: /^run$/i }).click();

    const response = await executePromise;
    expect(response.status()).toBe(400);
    expect(response.request().method()).toBe("POST");
    expect(response.url()).toBe(expectedExecuteUrl);
    const body = await response.json();
    expect(body.error).toBeTruthy();

    consumableHttpErrors = [
      {
        method: "POST",
        url: expectedExecuteUrl,
        status: 400,
        consumeConsoleStatusEcho: true,
      },
    ];

    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
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
  await page.context().addCookies([
    {
      name: "controlhub.locale",
      value: "en",
      domain: "localhost",
      path: "/",
    },
  ]);
  await loginViaUI(page);
  await page.locator('a[href="/query"]').first().click();
  await expect(page).toHaveURL(/\/query/);
}

/**
 * Build the full absolute execute URL for the currently selected ready target.
 * Derives the numeric target id after navigator selection from (in order):
 * 1) `?targetId=` on the workbench URL
 * 2) recent same-origin `/query-targets/{id}/…` resource timing (schema/history)
 * Browser API base is same-origin `/__api` (see e2e dev-server wrapper).
 */
async function exactExecuteUrlForActiveTarget(page: Page): Promise<string> {
  // Ready selection must expose Run before we can trust the active target.
  await expect(page.getByRole("button", { name: /^(run|执行)$/i })).toBeEnabled({
    timeout: 15_000,
  });

  let resolvedId: string | null = null;
  await expect
    .poll(
      async () => {
        const fromUrl = new URL(page.url()).searchParams.get("targetId");
        if (fromUrl && /^\d+$/.test(fromUrl)) {
          resolvedId = fromUrl;
          return fromUrl;
        }
        const fromTraffic = await page.evaluate(() => {
          const entries = performance.getEntriesByType("resource");
          for (let i = entries.length - 1; i >= 0; i -= 1) {
            const match = entries[i]!.name.match(
              /\/(?:__api\/)?query-targets\/(\d+)(?:\/|\?|$)/,
            );
            if (match) return match[1]!;
          }
          return null;
        });
        if (fromTraffic && /^\d+$/.test(fromTraffic)) {
          resolvedId = fromTraffic;
          return fromTraffic;
        }
        return null;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();

  if (resolvedId === null || !/^\d+$/.test(resolvedId)) {
    throw new Error(
      `expected numeric target id after ready selection, page=${page.url()}`,
    );
  }
  return new URL(
    `/__api/query-targets/${resolvedId}/execute`,
    new URL(page.url()).origin,
  ).href;
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
  // EN: "Run" / ZH: "执行" (actionState.run). Do not match "Run locked" / "执行已锁定".
  const run = page.getByRole("button", { name: /^(run|执行)$/i });
  if ((await run.count()) === 0) {
    return false;
  }
  return run.first().isEnabled().catch(() => false);
}

/** Fixture setup error when the dedicated ready query target is missing. */
function noReadyTargetFixtureError(): Error {
  return new Error(
    "E2E fixture setup error: no ready query target (availableActions.run). " +
      "Start the dedicated query MySQL fixture and seed a ready target before this suite.",
  );
}

/**
 * Connection navigator dialog/sheet title is localized (EN "Connections" /
 * ZH "连接"). Match both so ready-target selection works under zh-CN.
 */
function getConnectionDialog(page: Page) {
  return page.getByRole("dialog", { name: /^(Connections|连接)$/ });
}

/**
 * Open-connection triggers use i18n aria-labels (EN + ZH). Match both locales.
 */
function getConnectionOpenTriggers(page: Page) {
  const desktopTrigger = page.getByRole("button", {
    name: /^(Open connections|打开连接)$/,
  });
  const mobileTrigger = page.getByRole("button", {
    name: /^(Open connections on mobile|打开连接（移动端）)$/,
  });
  return { desktopTrigger, mobileTrigger };
}

/**
 * Select a ready query target via the connection navigator when Run is not
 * already enabled. Fails hard with a setup error when the fixture has no ready
 * target — never silently skips.
 */
async function ensureReadyTargetSelected(page: Page): Promise<void> {
  if (await isRunEnabled(page)) {
    return;
  }
  const readyIndex = await findReadyOptionIndex(page);
  if (readyIndex === null) {
    throw noReadyTargetFixtureError();
  }
  // findReadyOptionIndex already selected the ready target and waited for Run.
  await expect(page.getByRole("button", { name: /^(run|执行)$/i })).toBeEnabled({
    timeout: 15_000,
  });
}

function getConnectionTargetButtons(page: Page) {
  return getConnectionDialog(page).locator('ul button[aria-label]');
}

function getInactiveConnectionTargetButtons(page: Page) {
  return getConnectionDialog(page).locator(
    'ul button[aria-label]:not([aria-current="true"])',
  );
}

async function openConnectionNavigator(page: Page) {
  const dialog = getConnectionDialog(page);
  if (await dialog.isVisible()) {
    return dialog;
  }

  const { desktopTrigger, mobileTrigger } = getConnectionOpenTriggers(page);

  await expect(desktopTrigger.or(mobileTrigger)).toBeVisible({ timeout: 5_000 });
  const trigger = (await desktopTrigger.isVisible()) ? desktopTrigger : mobileTrigger;
  await trigger.click();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  return dialog;
}

async function connectionTargetCount(page: Page): Promise<number> {
  await openConnectionNavigator(page);
  const buttons = getConnectionTargetButtons(page);
  // Prefer an explicit zero-target setup error over a generic timeout on first().
  const count = await buttons.count();
  if (count === 0) {
    // Wait briefly for async list population before declaring empty fixture.
    try {
      await expect(buttons.first()).toBeVisible({ timeout: 5_000 });
    } catch {
      throw new Error(
        "E2E fixture setup error: connection navigator has zero targets. " +
          "Seed at least one query target before this suite.",
      );
    }
    return getConnectionTargetButtons(page).count();
  }
  await expect(buttons.first()).toBeVisible({ timeout: 5_000 });
  return count;
}

/**
 * Select a connection target by list index. After the dialog hides, waits for
 * the editor worksheet tabs to update (new worksheet created for a different
 * target) so we do not race the deferred worksheet-switch effect. Falls through
 * for same-target re-selection.
 */
async function selectConnectionTarget(page: Page, index: number): Promise<void> {
  const dialog = await openConnectionNavigator(page);
  const target = getConnectionTargetButtons(page).nth(index);
  await expect(target).toBeVisible({ timeout: 5_000 });
  await target.click();
  await expect(dialog).toBeHidden({ timeout: 5_000 });
}

/**
 * After navigator selection, wait until Run reflects the committed worksheet.
 * Samples Run-enabled state repeatedly and requires consecutive stable samples
 * before classifying — so a stale ready worksheet cannot misclassify a newly
 * selected locked target as ready. Locked targets omit the exact Run control
 * (or keep it disabled) → false. Schema-intelligence tests skip when false
 * unless the fixture must provide a ready target.
 */
async function waitForCommittedRunState(page: Page): Promise<boolean> {
  const run = page.getByRole("button", { name: /^(run|执行)$/i });
  const deadline = Date.now() + 5_000;
  let lastEnabled: boolean | null = null;
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const enabled =
      (await run.count()) > 0 &&
      (await run.first().isEnabled().catch(() => false));
    if (lastEnabled === enabled) {
      stableSamples += 1;
      if (stableSamples >= 5) {
        return enabled;
      }
    } else {
      lastEnabled = enabled;
      stableSamples = 1;
    }
    await page.waitForTimeout(100);
  }
  return (
    (await run.count()) > 0 && (await run.first().isEnabled().catch(() => false))
  );
}

async function findReadyOptionIndex(page: Page): Promise<number | null> {
  const count = await connectionTargetCount(page);
  if (count === 0) {
    throw new Error(
      "E2E fixture setup error: connection navigator has zero targets. " +
        "Seed at least one query target before this suite.",
    );
  }
  for (let index = 0; index < count; index += 1) {
    await selectConnectionTarget(page, index);
    if (await waitForCommittedRunState(page)) {
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

test.describe("Query Workbench schema intelligence", () => {
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];

  test.beforeAll(async () => {
    await checkBackendHealth();
  });

  test.beforeEach(async ({ page }) => {
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
      allowedWarnings: [/was preloaded using link preload but not used/],
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

  test("object explorer loads bounded database metadata and reveals fixture objects", async ({ page }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();
    const databases = explorer.getByRole("treeitem");
    await expect(databases.first()).toBeVisible({ timeout: 15_000 });
    await databases.first().getByRole("button").click();
    await expect(explorer.getByRole("tree")).toBeVisible();
  });

  test("Quick Navigator finds and reveals a schema object with bounded server search", async ({ page }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/schema/")) requests.push(request.url());
    });
    await page.keyboard.press(process.platform === "darwin" ? "Meta+P" : "Control+P");
    const navigator = page.getByRole("dialog", { name: /quick navigator/i });
    await expect(navigator).toBeVisible();
    const search = navigator.getByRole("textbox", { name: /search databases and objects/i });
    await search.fill("order");
    await expect.poll(() => requests.some((url) => /pageSize=50/.test(url))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(navigator).toBeHidden();
  });

  test("mobile object explorer opens as a drawer while the SQL editor remains primary", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    await expect(getEditor(page)).toBeVisible();

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await expect(objectsButton).toBeVisible();
    await objectsButton.click();

    const explorerSheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(explorerSheet).toBeVisible();
    await expect(explorerSheet).toHaveAttribute("data-side", "bottom");
    // Bounded objects load for a ready target inside the sheet.
    await expect(
      explorerSheet.getByRole("treeitem").first(),
    ).toBeVisible({ timeout: 15_000 });
    // SQL editor remains the primary workspace behind the sheet.
    await expect(getEditor(page)).toBeVisible();

    // Close via Escape — focus returns to the Objects trigger.
    await page.keyboard.press("Escape");
    await expect(explorerSheet).toBeHidden();
    await expect(objectsButton).toBeFocused();

    // Re-open and close via the visible close control.
    await objectsButton.click();
    await expect(explorerSheet).toBeVisible();
    await explorerSheet.getByRole("button", { name: "Close objects pane" }).click();
    await expect(explorerSheet).toBeHidden();
    await expect(objectsButton).toBeFocused();
  });

  test("Chinese mobile Objects sheet uses localized title and close label", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.context().clearCookies();
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "zh-CN",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);

    // Actively select a ready target under zh-CN. Connection open triggers use
    // locale-stable English aria-labels; the dialog title matches EN|ZH.
    // Do not skip when the default target is locked — fail only if no ready
    // fixture target exists at all.
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "打开对象", exact: true });
    await expect(objectsButton).toBeVisible();
    await objectsButton.click();

    const explorerSheet = page.getByRole("dialog", { name: "Schema 浏览器" });
    await expect(explorerSheet).toBeVisible();
    await expect(explorerSheet).toHaveAttribute("data-side", "bottom");
    // Bounded schema load for the ready target inside the sheet.
    await expect(
      explorerSheet.getByRole("treeitem").first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      explorerSheet.getByRole("button", { name: "关闭对象面板" }),
    ).toBeVisible();
    // SQL editor remains primary behind the sheet.
    await expect(getEditor(page)).toBeVisible();

    // Escape close + focus restore.
    await page.keyboard.press("Escape");
    await expect(explorerSheet).toBeHidden();
    await expect(objectsButton).toBeFocused();

    // Re-open and close via the localized close control (parity with EN mobile).
    await objectsButton.click();
    await expect(explorerSheet).toBeVisible();
    await explorerSheet.getByRole("button", { name: "关闭对象面板" }).click();
    await expect(explorerSheet).toBeHidden();
    await expect(objectsButton).toBeFocused();
  });
});
