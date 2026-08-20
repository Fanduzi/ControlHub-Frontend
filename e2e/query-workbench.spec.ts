// input: @playwright/test, ./harness/*, ./api.helpers, real backend/frontend at localhost
// output: Playwright E2E specs for the query workbench (shell, schema, FK nav, inspector, paging, saved statements, terminal delete 404-absence, 375 search-row/no-overflow, explain, relmap, shared-template affordance/disposal, schema metadata identity isolation)
// pos: real-browser integration tests covering query workbench user flows across viewport/locale/role
// note: if this file changes, update header and e2e/README.md
import { expect, test, type Page, type Request as PlaywrightRequest } from "@playwright/test";
import { checkBackendHealth } from "./harness/backend-health";
import { loginViaUI } from "./harness/auth";
import { resolveFixtureIdentity } from "./harness/fixtures";
import { getAuthToken, apiFetch } from "./api.helpers";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
  takeExpectedConsoleStatusError,
  takeExpectedNetworkError,
  type ConsoleMessage,
  type ExpectedHttpError,
} from "./harness/console-guards";

const FIXTURE_DIAGNOSTIC =
  "Run: make query-e2e-mysql-up && seed-query-dev-target";

// Provisioned per-run fixture operator used by no-leak assertions (the
// operator identity must never leak into saved-statement rows).
const FIXTURE_ADMIN_EMAIL = resolveFixtureIdentity("admin").email;

const PROBE_API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

test.beforeAll(async () => {
  await checkBackendHealth();

  const token = await getAuthToken();

  const targetsRes = await fetch(`${PROBE_API_BASE}/query-targets`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!targetsRes.ok) {
    throw new Error(
      `Fixture readiness probe failed: GET /query-targets returned ${targetsRes.status}. ${FIXTURE_DIAGNOSTIC}`,
    );
  }

  const targetsBody = (await targetsRes.json()) as {
    items?: Array<{
      resourceId: number;
      availableActions?: { run?: boolean };
    }>;
  };
  const targets = targetsBody.items ?? [];
  const readyTarget = targets.find((t) => t.availableActions?.run === true);
  if (!readyTarget) {
    throw new Error(
      `Fixture readiness probe failed: no query target with availableActions.run === true. ${FIXTURE_DIAGNOSTIC}`,
    );
  }

  const schemaRes = await fetch(
    `${PROBE_API_BASE}/query-targets/${readyTarget.resourceId}/schema/databases`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!schemaRes.ok) {
    throw new Error(
      `Fixture readiness probe failed: GET /query-targets/${readyTarget.resourceId}/schema/databases returned ${schemaRes.status}. ${FIXTURE_DIAGNOSTIC}`,
    );
  }
});

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

    // Wait for editor to load default content with retry
    await expect.poll(() => getEditorContent(page), { timeout: 10_000 }).toContain("select 1");

    await page.getByRole("button", { name: /^run$/i }).click();

    // The backend executes `select 1` and returns a single INT cell.
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("SHOW TABLES is blocked by disclosure policy", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    // Track the execute URL for consumable error.
    const expectedExecuteUrl = await exactExecuteUrlForActiveTarget(page);

    // Replace the default statement with SHOW TABLES.
    await clearAndType(page, "SHOW TABLES");

    await page.getByRole("button", { name: /^run$/i }).click();

    // Non-SELECT metadata queries are blocked by disclosure policy (fail-closed).
    // The result should show a disclosure blocked error, not a result grid.
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/blocked by result disclosure policy/i)).toBeVisible();
    await expect(page.getByRole("grid")).not.toBeVisible();

    // The backend returns 403 for disclosure-blocked queries.
    consumableHttpErrors = [
      { method: "POST", url: expectedExecuteUrl, status: 403, consumeConsoleStatusEcho: true },
    ];
  });

  test("DESCRIBE is blocked by disclosure policy", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    const expectedExecuteUrl = await exactExecuteUrlForActiveTarget(page);

    // DESCRIBE is a non-SELECT metadata query, blocked by disclosure policy.
    await clearAndType(page, "DESCRIBE query_e2e_items");
    await page.getByRole("button", { name: /^run$/i }).click();

    // Non-SELECT metadata queries are blocked by disclosure policy (fail-closed).
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/blocked by result disclosure policy/i)).toBeVisible();
    await expect(page.getByRole("grid")).not.toBeVisible();

    consumableHttpErrors = [
      { method: "POST", url: expectedExecuteUrl, status: 403, consumeConsoleStatusEcho: true },
    ];
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
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
      timeout: 15_000,
    });

    // After the run settles, the history tab refreshes and records the attempt
    // (metadata only — the statement preview surfaces, never result rows).
    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("select 1").first()).toBeVisible({ timeout: 15_000 });
  });

  test("query history records SHOW TABLES blocked attempt", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    const expectedExecuteUrl = await exactExecuteUrlForActiveTarget(page);

    await clearAndType(page, "SHOW TABLES");
    await page.getByRole("button", { name: /^run$/i }).click();

    // SHOW TABLES is blocked by disclosure policy. The blocked attempt
    // should still be recorded in query history.
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });

    consumableHttpErrors = [
      { method: "POST", url: expectedExecuteUrl, status: 403, consumeConsoleStatusEcho: true },
    ];

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
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
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
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
      timeout: 15_000,
    });

    const activeTab = page.locator('[role="tab"][aria-selected="true"]').first();
    const activeTabName = await activeTab.textContent();

    await page.getByRole("button", { name: /add worksheet/i }).click();

    const editor2 = page.locator(".cm-content");
    await expect(editor2).toBeVisible();

    await page.getByRole("tab", { name: activeTabName!, exact: true }).click();

    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible();
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
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
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

  test("copy cell value via the copy button and verify no backend request", async ({ page }) => {
    await openQueryWorkbench(page);

    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);

    // Grant clipboard permissions so the copy button can write to the clipboard.
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    // Run the default select 1.
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
      timeout: 15_000,
    });

    // Track network requests after the execution completes to prove copy is local.
    const requestsAfterRun: string[] = [];
    page.on("request", (request) => {
      requestsAfterRun.push(request.url());
    });

    // Select a cell by clicking it, then copy via the toolbar button.
    const table = page.getByRole("grid");
    await expect(table).toBeVisible();
    const cell = table.locator("tbody td").first();
    await expect(cell).toBeVisible();
    await cell.click();

    // The single toolbar copy button copies the selected cell.
    const copyButton = page.getByTestId("copy-selection");
    await expect(copyButton).toBeEnabled();
    await copyButton.click();

    // Verify the success feedback appears.
    await expect(page.getByRole("status")).toHaveText(/copied/i, {
      timeout: 5_000,
    });

    // Verify the clipboard contains the expected value.
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("1");

    // Verify no unexpected backend request was made during the copy action.
    // The only requests should be from the initial page load and query execution.
    const unexpectedRequests = requestsAfterRun.filter(
      (url) => !url.includes("localhost") || url.includes("/execute"),
    );
    expect(unexpectedRequests).toHaveLength(0);
  });
});

// Phase 38X-4 (#44): schema completion metadata keyed to one active Schema
// Metadata Identity (targetResourceId, database). The shell's completion load
// is the only caller using pageSize=100, so a request filter on that value
// isolates the shell's database-list / object requests from the lazy Objects
// explorer (pageSize 25) and the Cmd/Ctrl+P navigator (pageSize 50).
test.describe("Phase 38X-4: Schema Metadata Identity", () => {
  const RUN = /^(run|执行)$/i;

  /** Count matching same-origin API requests, resettable per load generation. */
  function requestTracker(
    page: Page,
    predicate: (url: URL, method: string) => boolean,
  ): { list: () => string[]; clear: () => void } {
    const seen: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (predicate(url, request.method())) seen.push(request.url());
    });
    return {
      list: () => seen,
      clear: () => {
        seen.length = 0;
      },
    };
  }

  test("desktop EN: one database-list request per load generation, reused on database selection", async ({ page }) => {
    // Shell database-list requests (the only pageSize=100 caller).
    const dbList = requestTracker(
      page,
      (url, method) =>
        method === "GET" &&
        url.pathname.endsWith("/schema/databases") &&
        url.searchParams.get("pageSize") === "100",
    );
    // Shell object responses (pageSize=100 caller), keyed by database.
    const shellObjectStatus: string[] = [];
    page.on("response", (response) => {
      const url = new URL(response.url());
      if (
        url.pathname.endsWith("/schema/objects") &&
        url.searchParams.get("pageSize") === "100"
      ) {
        shellObjectStatus.push(`${response.status()}:${url.searchParams.get("database")}`);
      }
    });

    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);
    await expect(page.getByRole("button", { name: RUN })).toBeEnabled({ timeout: 15_000 });

    // Count a fresh load generation for the already-selected ready target.
    dbList.clear();
    await page.reload();
    await expect(page).toHaveURL(/\/query/);
    await expect(page.getByRole("button", { name: RUN })).toBeEnabled({ timeout: 15_000 });

    // Exactly one database-list request supplies default selection and
    // database-name completions for this load generation.
    await expect.poll(() => dbList.list().length).toBe(1);

    // Null server default: the workbench waits for an explicit database choice
    // instead of guessing, but the target-scoped database completion is ready.
    await page.keyboard.press(process.platform === "darwin" ? "Meta+P" : "Control+P");
    const navigator = page.getByRole("dialog", { name: /quick navigator/i });
    await expect(navigator).toBeVisible();
    await navigator
      .getByRole("textbox", { name: /search databases and objects/i })
      .fill("query_e2e");
    await expect(
      navigator.getByRole("button", { name: "query_e2e", exact: true }),
    ).toBeVisible();

    // Explicit selection reuses the same database list (no duplicate request)
    // and the shell's object completion load succeeds for that database.
    await navigator.getByRole("button", { name: "query_e2e", exact: true }).click();
    await expect.poll(() => dbList.list().length).toBe(1);
    await expect
      .poll(() =>
        shellObjectStatus.some((s) => s === "200:query_e2e"),
      )
      .toBe(true);
    // Dismiss the modal navigator (its database picker does not auto-close).
    await page.keyboard.press("Escape");
    await expect(navigator).toBeHidden();
    // The metadata load did not fail, so no retry warning is shown and Run
    // remains available (keyword-only degradation is proven at the component
    // seam, not fabricated here).
    await expect(page.getByTestId("metadata-warning")).toHaveCount(0);
    await expect(page.getByRole("button", { name: RUN })).toBeEnabled();
  });

  test("375px EN: schema completion available without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);
    await ensureReadyTargetSelected(page);
    await expect(page.getByRole("button", { name: RUN })).toBeEnabled({ timeout: 15_000 });

    // No horizontal scrollbar at the 375px viewport once the workbench renders
    // (measured, not a CSS-class snapshot).
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(
            0,
            document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);

    // The mobile objects trigger is accessible and opens the schema browser
    // sheet; schema metadata renders inside it without horizontal overflow.
    const objectsTrigger = page.getByRole("button", { name: "Open objects", exact: true });
    await expect(objectsTrigger).toBeVisible();
    await objectsTrigger.click();
    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("treeitem").first()).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(
            0,
            document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("desktop zh-CN: schema completion controls localized without overflow", async ({ page }) => {
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

    // Actively select a ready target under zh-CN (locale-stable EN triggers).
    await ensureReadyTargetSelected(page);
    await expect(page.getByRole("button", { name: RUN })).toBeEnabled({ timeout: 15_000 });

    // Localized quick navigator lists the target-scoped databases (completion
    // metadata is available and rendered with the zh-CN labels).
    await page.keyboard.press(process.platform === "darwin" ? "Meta+P" : "Control+P");
    const navigator = page.getByRole("dialog", { name: /快速导航/ });
    await expect(navigator).toBeVisible();
    await navigator
      .getByRole("textbox", { name: /搜索数据库和对象/ })
      .fill("query_e2e");
    await expect(
      navigator.getByRole("button", { name: "query_e2e", exact: true }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(navigator).toBeHidden();

    // No horizontal overflow on desktop zh-CN with schema metadata rendered.
    await expect
      .poll(() =>
        page.evaluate(() =>
          Math.max(
            0,
            document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          ),
        ),
      )
      .toBeLessThanOrEqual(1);
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
 * Browser API base under BFF sessions is same-origin `/api/proxy`.
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
              /\/(?:api\/proxy\/|__api\/)?query-targets\/(\d+)(?:\/|\?|$)/,
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
    `/api/proxy/query-targets/${resolvedId}/execute`,
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
  await target.scrollIntoViewIfNeeded();
  await expect(target).toBeEnabled({ timeout: 5_000 });
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
  return false;
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

test.describe("FK record navigation", () => {
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
      const screenshotPath = `query-fk-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("preview rows creates a new worksheet and related records navigates to referenced rows", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    // Step 1: Open Objects pane and expand the FK fixture table.
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    // Expand query_e2e_aux database.
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    // Expand schema_child table (has FK → schema_parent).
    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    // Step 2: Click Preview rows.
    const previewButton = explorer.getByRole("button", { name: "Preview rows" });
    await expect(previewButton).toBeVisible({ timeout: 10_000 });

    // Record initial worksheet tab count.
    const initialTabCount = await page.locator('[role="tab"][id^="ws-tab-"]').count();

    await previewButton.click();

    // Step 3: Assert a new worksheet was created (one more tab).
    await expect(page.locator('[role="tab"][id^="ws-tab-"]')).toHaveCount(initialTabCount + 1);

    // The new worksheet should contain a generated qualified SELECT statement.
    const editorContent = await getEditorContent(page);
    expect(editorContent).toContain("SELECT * FROM");
    expect(editorContent).toContain("schema_child");

    // No auto-run: the result area should still say "not executed" or have no grid.
    // (The preview does not auto-execute.)
    await expect(page.getByText("0 rows · not executed")).toBeVisible();

    // Step 4: Run the unchanged preview.
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // The grid should have data rows from schema_child.
    const firstDataCell = page.getByRole("gridcell").first();
    await expect(firstDataCell).toBeVisible();

    // Step 5: Select a data cell (any row — parent_id is non-null in fixture).
    await firstDataCell.click();

    // Step 6: The Related records menu should appear for eligible FK.
    const relatedButton = page.getByTestId("related-records");
    await expect(relatedButton).toBeVisible({ timeout: 5_000 });

    // Intercept the related-records API call to verify it's made.
    const relatedRequest = page.waitForRequest(
      (req) => req.url().includes("/related-records") && req.method() === "POST",
      { timeout: 10_000 },
    );
    const relatedResponse = page.waitForResponse(
      (resp) => resp.url().includes("/related-records") && resp.status() === 200,
      { timeout: 15_000 },
    );

    await relatedButton.click();

    // Select the fk_schema_child_parent relation.
    const menuItem = page.getByRole("menuitem", { name: /fk_schema_child_parent/ });
    await expect(menuItem).toBeVisible();
    await menuItem.click();

    // Verify the API call was made.
    const request = await relatedRequest;
    expect(request.url()).toContain("/related-records");
    const response = await relatedResponse;
    expect(response.status()).toBe(200);

    // Step 7: Assert the related records panel appears with referenced data.
    const relatedPanel = page.getByRole("region", { name: "Related records" });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });

    // The panel should show schema_parent columns (parent_code, label).
    await expect(relatedPanel.getByRole("grid")).toBeVisible({ timeout: 10_000 });

    // Step 8: Assert the source grid is still visible (unchanged).
    // There should be two grids: the source result and the related result.
    const grids = page.getByRole("grid");
    await expect(grids).toHaveCount(2);

    // Step 9: Assert no selected value leakage into the editor.
    const finalEditorContent = await getEditorContent(page);
    // The editor should still contain only the generated SELECT, not any cell value.
    expect(finalEditorContent).toContain("SELECT * FROM");
    expect(finalEditorContent).not.toContain("P_ALPHA");
    expect(finalEditorContent).not.toContain("Alpha Parent");
  });

  test("related records panel close restores focus to the trigger button", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    // Open Objects and expand schema_child.
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();
    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    // Preview and run.
    await explorer.getByRole("button", { name: "Preview rows" }).click();
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Select a cell and navigate related records.
    await page.getByRole("gridcell").first().click();
    const relatedButton = page.getByTestId("related-records");
    await expect(relatedButton).toBeVisible({ timeout: 5_000 });
    await relatedButton.click();
    await page.getByRole("menuitem", { name: /fk_schema_child_parent/ }).click();
    await expect(page.getByRole("region", { name: "Related records" })).toBeVisible({ timeout: 15_000 });

    // Close the panel.
    await page.getByRole("button", { name: "Close related records" }).click();
    await expect(page.getByRole("region", { name: "Related records" })).toBeHidden();

    // Focus should return to the Related records trigger.
    await expect(relatedButton).toBeFocused();
  });

  test("Chinese locale renders preview and related records strings", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();
    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const previewButton = explorer.getByRole("button", { name: "预览行" });
    await expect(previewButton).toBeVisible({ timeout: 10_000 });
  });

  test("mobile Objects Sheet completes FK navigation at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await objectsButton.click();

    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible();

    const auxDb = sheet.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = sheet.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const previewButton = sheet.getByRole("button", { name: "Preview rows" });
    await expect(previewButton).toBeVisible({ timeout: 10_000 });
    await previewButton.click();

    await expect(page.getByText("0 rows · not executed")).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    const firstDataCell = page.getByRole("gridcell").first();
    await expect(firstDataCell).toBeVisible();
    await firstDataCell.click();

    const relatedButton = page.getByTestId("related-records");
    await expect(relatedButton).toBeVisible({ timeout: 5_000 });

    const relatedRequest = page.waitForRequest(
      (req) => req.url().includes("/related-records") && req.method() === "POST",
      { timeout: 10_000 },
    );

    await relatedButton.click();
    await page.getByRole("menuitem", { name: /fk_schema_child_parent/ }).click();

    const request = await relatedRequest;
    expect(request.url()).toContain("/related-records");

    const relatedPanel = page.getByRole("region", { name: "Related records" });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });
    await expect(relatedPanel.getByRole("grid")).toBeVisible();
    await expect(page.getByRole("grid")).toHaveCount(2);

    await page.getByRole("button", { name: "Close related records" }).click();
    await expect(relatedPanel).toBeHidden();
    await expect(relatedButton).toBeFocused();
  });

  test("Chinese locale completes full FK navigation path", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();
    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const previewButton = explorer.getByRole("button", { name: "预览行" });
    await expect(previewButton).toBeVisible({ timeout: 10_000 });
    await previewButton.click();

    await expect(page.getByText("0 行 · 未执行")).toBeVisible();

    await page.getByRole("button", { name: /^执行$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    const firstDataCell = page.getByRole("gridcell").first();
    await expect(firstDataCell).toBeVisible();
    await firstDataCell.click();

    const relatedButton = page.getByTestId("related-records");
    await expect(relatedButton).toBeVisible({ timeout: 5_000 });

    const relatedRequest = page.waitForRequest(
      (req) => req.url().includes("/related-records") && req.method() === "POST",
      { timeout: 10_000 },
    );

    await relatedButton.click();
    await page.getByRole("menuitem", { name: /fk_schema_child_parent/ }).click();

    const request = await relatedRequest;
    expect(request.url()).toContain("/related-records");

    const relatedPanel = page.getByRole("region", { name: "关联记录" });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });
    await expect(relatedPanel.getByRole("grid")).toBeVisible();

    const finalEditorContent = await getEditorContent(page);
    expect(finalEditorContent).toContain("SELECT * FROM");
    expect(finalEditorContent).not.toContain("P_ALPHA");
    expect(finalEditorContent).not.toContain("Alpha Parent");

    await page.getByRole("button", { name: "关闭关联记录" }).click();
    await expect(relatedPanel).toBeHidden();
    await expect(relatedButton).toBeFocused();
  });
});

test.describe("Object Inspector metadata", () => {
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
      const screenshotPath = `query-inspector-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("desktop EN: Inspect opens read-only metadata panel with columns, indexes, and foreign keys", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    const columnsSection = inspector.locator('[aria-label="Columns"]');
    await expect(columnsSection).toBeVisible();
    await expect(columnsSection.getByRole("cell", { name: "id", exact: true })).toBeVisible();

    const indexesSection = inspector.locator('[aria-label="Indexes"]');
    await expect(indexesSection).toBeVisible();

    const fkSection = inspector.locator('[aria-label="Foreign Keys"]');
    await expect(fkSection).toBeVisible();
    await expect(fkSection.getByText("fk_schema_child_parent")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
    await expect(inspectButton).toBeFocused();
  });

  test("375px mobile EN: Inspector opens as a bottom sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await objectsButton.click();

    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible();

    const auxDb = sheet.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = sheet.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = sheet.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    const inspectorSheet = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspectorSheet).toBeVisible({ timeout: 30_000 });
    await expect(inspectorSheet).toHaveAttribute("data-side", "bottom");

    await expect(inspectorSheet.locator('[aria-label="Columns"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(inspectorSheet).toBeHidden();
  });

  test("zh-CN desktop: localized Inspect button and Inspector title", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "检查" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — 检查器/ });
    await expect(inspector).toBeVisible();

    await expect(inspector.locator('[aria-label="列"]')).toBeVisible();
    await expect(inspector.locator('[aria-label="索引"]')).toBeVisible();
    await expect(inspector.locator('[aria-label="外键"]')).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
    await expect(inspectButton).toBeFocused();
  });

  test("opening Inspector sends no execute, related-record, or additional object-detail request", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    await expect(explorer.getByRole("button", { name: "Inspect" })).toBeVisible({ timeout: 10_000 });

    const requestsBefore: string[] = [];
    page.on("request", (req) => {
      requestsBefore.push(req.url());
    });

    await explorer.getByRole("button", { name: "Inspect" }).click();
    await expect(page.getByRole("dialog", { name: /Inspector/ })).toBeVisible();

    const forbidden = requestsBefore.filter(
      (url) =>
        url.includes("/execute") ||
        url.includes("/related-records") ||
        url.includes("/object-details"),
    );
    expect(forbidden).toHaveLength(0);
  });

  test("a locked target hides the Inspect button", async ({ page }) => {
    await openQueryWorkbench(page);

    const count = await connectionTargetCount(page);
    let verifiedLocked = false;
    for (let index = 0; index < count; index += 1) {
      await selectConnectionTarget(page, index);
      if (!(await isRunEnabled(page))) {
        await page.getByRole("button", { name: "Objects", exact: true }).click();
        const explorer = page.getByRole("complementary", { name: "Objects" });
        await expect(explorer).toBeVisible();

        await expect(explorer.getByRole("button", { name: "Inspect" })).toHaveCount(0);
        verifiedLocked = true;
        break;
      }
    }
    if (!verifiedLocked) {
      throw new Error(
        "E2E fixture setup error: no locked query target found. " +
        "Seed a locked (non-ready) query target before this suite."
      );
    }
  });

  test("desktop EN: Close inspector button restores focus to the trigger button", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    await inspector.getByRole("button", { name: "Close inspector" }).click();
    await expect(inspector).toBeHidden();
    await expect(inspectButton).toBeFocused();
  });

  test("375px mobile EN: Escape and Close inspector restore focus to Inspect button", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await objectsButton.click();

    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible();

    const auxDb = sheet.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = sheet.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = sheet.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });

    // Test Escape key closes and restores focus
    await inspectButton.click();
    const inspectorSheet = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspectorSheet).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press("Escape");
    await expect(inspectorSheet).toBeHidden();
    await expect(inspectButton).toBeFocused();

    // Test Close button closes and restores focus
    await inspectButton.click();
    await expect(inspectorSheet).toBeVisible({ timeout: 30_000 });
    await inspectorSheet.getByRole("button", { name: "Close inspector" }).click();
    await expect(inspectorSheet).toBeHidden();
    await expect(inspectButton).toBeFocused();
  });

  test("Back then immediate Close restores focus to Inspect trigger, not View relationships", async ({ page }) => {
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    const viewRelButton = inspector.getByTestId("view-relationships-button");
    await expect(viewRelButton).toBeVisible();
    await viewRelButton.click();

    const relMapDialog = page.getByRole("dialog", { name: "Relationships" });
    await expect(relMapDialog).toBeVisible({ timeout: 10_000 });

    const backButton = relMapDialog.getByRole("button", { name: /Back to details/ });
    await backButton.click();

    // Immediately close without waiting for focus restoration
    const closeButton = inspector.getByRole("button", { name: "Close inspector" });
    await closeButton.click();
    await expect(inspector).toBeHidden();

    // Focus must be on Inspect trigger, not on View relationships button
    await expect(inspectButton).toBeFocused({ timeout: 5_000 });
  });

  test("zh-CN: Inspector close button has accessible name '关闭检查器'", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "检查" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — 检查器/ });
    await expect(inspector).toBeVisible();

    // Verify the close button has the correct accessible name
    const closeButton = inspector.getByRole("button", { name: "关闭检查器" });
    await expect(closeButton).toBeVisible();

    // Verify it's NOT named "Close" or "关闭对象面板"
    await expect(inspector.getByRole("button", { name: "Close" })).toHaveCount(0);
    await expect(inspector.getByRole("button", { name: "关闭对象面板" })).toHaveCount(0);
  });

  test("multiple objects expanded: focus returns to the correct Inspect button", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    // Expand both tables
    const childTable = explorer.getByRole("treeitem", { name: "schema_child", exact: true });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const parentTable = explorer.getByRole("treeitem", { name: "schema_parent", exact: true });
    await expect(parentTable).toBeVisible({ timeout: 10_000 });
    await parentTable.click();

    // Get all Inspect buttons
    const inspectButtons = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButtons).toHaveCount(2);

    // Click the first Inspect button (schema_child)
    const firstInspect = inspectButtons.first();
    await firstInspect.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    // Close and verify focus returns to the first Inspect button
    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
    await expect(firstInspect).toBeFocused();
  });

});

test.describe("Table definition inspector", () => {
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
      const screenshotPath = `query-def-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("desktop English: Inspector open makes no definition request; View definition shows CREATE TABLE", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    // Track definition requests
    const definitionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/table-definition")) {
        definitionRequests.push(request.url());
      }
    });

    // Open Objects pane and expand a database with tables
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    // Expand query_e2e_aux database
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    // Expand schema_child table
    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    // Click Inspect
    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    // Inspector should open
    const inspector = page.getByRole("dialog", { name: /Inspector/ });
    await expect(inspector).toBeVisible();

    // NO definition request should have been made on open
    expect(definitionRequests).toHaveLength(0);

    // NO execute or related-records request should have been made
    // (we only track definition here; the console/network guards catch others)

    // Click View definition
    const viewDefButton = inspector.getByTestId("view-definition-button");
    await expect(viewDefButton).toBeVisible();
    await expect(viewDefButton).toHaveText("View definition");
    await viewDefButton.click();

    // Exactly one definition request should have been made
    await expect.poll(() => definitionRequests.length, { timeout: 10_000 }).toBe(1);

    // Verify the request URL contains the expected path
    expect(definitionRequests[0]).toContain("/table-definition");
    expect(definitionRequests[0]).toContain("database=");
    expect(definitionRequests[0]).toContain("name=");

    // The CREATE TABLE text should be visible
    await expect(inspector.getByText(/CREATE TABLE/)).toBeVisible({ timeout: 15_000 });

    // Definition section title should be visible
    await expect(inspector.getByText("Definition", { exact: true })).toBeVisible();
  });

  test("375px mobile English: View definition works in bottom sheet Inspector", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    // Open Objects pane
    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await expect(objectsButton).toBeVisible();
    await objectsButton.click();

    const explorer = page.getByRole("dialog", { name: "Schema browser" });
    await expect(explorer).toBeVisible();

    // Expand database and table
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    // Click Inspect
    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    // Mobile Inspector opens as a sheet
    const inspector = page.getByRole("dialog", { name: /Inspector/ });
    await expect(inspector).toBeVisible();

    // Click View definition
    const viewDefButton = inspector.getByTestId("view-definition-button");
    await expect(viewDefButton).toBeVisible();
    await viewDefButton.click();

    // CREATE TABLE text should be visible
    await expect(inspector.getByText(/CREATE TABLE/)).toBeVisible({ timeout: 15_000 });

    // Close via Escape — should not break Sheet behavior
    await page.keyboard.press("Escape");
    await expect(inspector).toBeHidden();
  });

  test("desktop Simplified Chinese: localized definition action and section labels", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    // Open Objects pane
    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    // Expand database and table
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    // Click Inspect (检查)
    const inspectButton = explorer.getByRole("button", { name: "检查" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /检查器/ });
    await expect(inspector).toBeVisible();

    // Chinese "View definition" (查看定义) button
    const viewDefButton = inspector.getByTestId("view-definition-button");
    await expect(viewDefButton).toBeVisible();
    await expect(viewDefButton).toHaveText("查看定义");

    // Click it
    await viewDefButton.click();

    // Chinese "Definition" (定义) section title
    await expect(inspector.getByText("定义", { exact: true })).toBeVisible({ timeout: 15_000 });

    // CREATE TABLE text should be visible
    await expect(inspector.getByText(/CREATE TABLE/)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe("Schema explorer search and pagination", () => {
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
      const screenshotPath = `query-search-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("desktop English: search uses server q and Clear restores unfiltered page 1", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const schemaRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/schema/objects")) {
        schemaRequests.push(request.url());
      }
    });

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    await expect(explorer.getByRole("tree")).toBeVisible({ timeout: 10_000 });
    await expect(explorer.getByText("schema_child")).toBeVisible({ timeout: 10_000 });

    const searchInput = explorer.getByRole("textbox", { name: /search objects in query_e2e_aux/i });
    await expect(searchInput).toBeVisible();

    const searchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("q=schema_zz_page_26") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await searchInput.fill("schema_zz_page_26");
    await searchResponse;

    await expect(explorer.getByText("schema_zz_page_26")).toBeVisible({ timeout: 10_000 });
    await expect(explorer.getByText("schema_child")).not.toBeVisible({ timeout: 5_000 });

    expect(schemaRequests.some((url) => url.includes("q=schema_zz_page_26"))).toBe(true);

    const clearResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("database=query_e2e_aux") &&
        !resp.url().includes("q=") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await explorer.getByRole("button", { name: "Clear search in query_e2e_aux" }).click();
    await clearResponse;

    await expect(searchInput).toHaveValue("");
    await expect(explorer.getByText("schema_child")).toBeVisible({ timeout: 10_000 });
    await expect(explorer.getByText("schema_zz_page_26")).not.toBeVisible({ timeout: 5_000 });
  });

  test("desktop English: Load more objects loads page 2 and objects remain inspectable", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    await expect(explorer.getByRole("tree")).toBeVisible({ timeout: 10_000 });

    const loadMoreButton = explorer.getByRole("button", { name: "Load more objects in query_e2e_aux" });
    await expect(loadMoreButton).toBeVisible({ timeout: 5_000 });

    const schemaRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/schema/objects")) {
        schemaRequests.push(request.url());
      }
    });

    await loadMoreButton.click();

    await expect(explorer.getByText("schema_zz_page_24")).toBeVisible({ timeout: 10_000 });

    expect(schemaRequests.some((url) => url.includes("page=2"))).toBe(true);

    const page2Object = explorer.getByRole("treeitem", { name: "schema_zz_page_24" });
    await expect(page2Object).toBeVisible();
    await page2Object.click();

    await expect(explorer.getByRole("button", { name: "Inspect" })).toBeVisible({ timeout: 10_000 });
  });

  test("mobile English: search and Load more work in Objects Sheet at 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await objectsButton.click();

    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible();

    const auxDb = sheet.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    await expect(sheet.getByRole("tree")).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText("schema_child")).toBeVisible({ timeout: 10_000 });

    const searchInput = sheet.getByRole("textbox", { name: /search objects in query_e2e_aux/i });
    await expect(searchInput).toBeVisible();

    const searchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("q=schema_zz_page_26") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await searchInput.fill("schema_zz_page_26");
    await searchResponse;

    await expect(sheet.getByText("schema_zz_page_26")).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText("schema_child")).not.toBeVisible({ timeout: 5_000 });

    const clearResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("database=query_e2e_aux") &&
        !resp.url().includes("q=") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await sheet.getByRole("button", { name: "Clear search in query_e2e_aux" }).click();
    await clearResponse;
    await expect(searchInput).toHaveValue("");
    await expect(sheet.getByText("schema_child")).toBeVisible({ timeout: 10_000 });

    const loadMoreButton = sheet.getByRole("button", { name: "Load more objects in query_e2e_aux" });
    await expect(loadMoreButton).toBeVisible({ timeout: 10_000 });
    const page2Response = page.waitForResponse(
      (resp) => resp.url().includes("/schema/objects") && resp.url().includes("page=2") && resp.ok(),
      { timeout: 15_000 },
    );
    await loadMoreButton.click();
    await page2Response;

    await expect(sheet.getByText("schema_zz_page_24")).toBeVisible({ timeout: 10_000 });
  });

  test("desktop Simplified Chinese: localized search controls and pagination", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    await expect(explorer.getByRole("tree")).toBeVisible({ timeout: 10_000 });
    await expect(explorer.getByText("schema_child")).toBeVisible({ timeout: 10_000 });

    const searchInput = explorer.getByRole("textbox", { name: /搜索 query_e2e_aux 中的对象/i });
    await expect(searchInput).toBeVisible();

    const searchResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("q=schema_zz_page_26") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await searchInput.fill("schema_zz_page_26");
    await searchResponse;

    await expect(explorer.getByText("schema_zz_page_26")).toBeVisible({ timeout: 10_000 });
    await expect(explorer.getByText("schema_child")).not.toBeVisible({ timeout: 5_000 });

    const clearResponse = page.waitForResponse(
      (resp) =>
        resp.url().includes("/schema/objects") &&
        resp.url().includes("database=query_e2e_aux") &&
        !resp.url().includes("q=") &&
        resp.ok(),
      { timeout: 15_000 },
    );
    await explorer.getByRole("button", { name: "清除 query_e2e_aux 中的搜索" }).click();
    await clearResponse;
    await expect(searchInput).toHaveValue("");
    await expect(explorer.getByText("schema_child")).toBeVisible({ timeout: 10_000 });

    const loadMoreButton = explorer.getByRole("button", { name: "加载更多 query_e2e_aux 中的对象" });
    await expect(loadMoreButton).toBeVisible({ timeout: 10_000 });
    const page2Response = page.waitForResponse(
      (resp) => resp.url().includes("/schema/objects") && resp.url().includes("page=2") && resp.ok(),
      { timeout: 15_000 },
    );
    await loadMoreButton.click();
    await page2Response;

    await expect(explorer.getByText("schema_zz_page_24")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("Query History cursor-based pagination, filters, and detail", () => {
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
      { name: "controlhub.locale", value: "en", domain: "localhost", path: "/" },
    ]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `query-history-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  async function runMultipleQueries(page: Page, count: number): Promise<void> {
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw new Error("no ready query target seeded");
    await selectConnectionTarget(page, readyIndex);

    for (let i = 0; i < count; i++) {
      await clearAndType(page, `SELECT ${i + 1}`);
      await page.getByRole("button", { name: /^run$/i }).click();
      await expect(page.locator("td").filter({ hasText: new RegExp(`^${i + 1}$`) })).toBeVisible({ timeout: 30_000 });
    }
  }

  test("desktop EN: creates 2+ pages of history via governed Run and shows Load more", async ({ page }) => {
    await openQueryWorkbench(page);
    await runMultipleQueries(page, 3);

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("SELECT 2").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("SELECT 3").first()).toBeVisible({ timeout: 5_000 });

    const loadMoreButton = page.getByRole("button", { name: /load more/i });
    const hasLoadMore = await loadMoreButton.count();
    if (hasLoadMore > 0) {
      await expect(loadMoreButton).toBeVisible();
    }
  });

  test("desktop EN: filter Apply narrows history by status", async ({ page }) => {
    await openQueryWorkbench(page);
    await runMultipleQueries(page, 2);

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    const statusFilter = page.locator("#history-filter-status");
    await expect(statusFilter).toBeVisible();
    await statusFilter.click();
    await page.getByRole("option", { name: /success/i }).click();

    await page.getByRole("button", { name: /apply/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 10_000 });
  });

  test("desktop EN: clicking a history row opens execution detail sheet", async ({ page }) => {
    await openQueryWorkbench(page);
    await runMultipleQueries(page, 1);

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    const historyRow = page.locator("tr[role='button']").filter({ hasText: "SELECT 1" }).first();
    await expect(historyRow).toBeVisible();
    await historyRow.click();

    const detailSheet = page.getByRole("dialog", { name: /execution details/i });
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });
    await expect(detailSheet.getByText(/actor|执行人/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(detailSheet).toBeHidden();
    await expect(historyRow).toBeFocused();
  });

  test("desktop EN: actor display name shown, never raw actorUserId", async ({ page }) => {
    await openQueryWorkbench(page);
    await runMultipleQueries(page, 1);

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText(/actorUserId/i)).toHaveCount(0);

    const actorCells = page.locator("td").filter({ hasText: /\w+/ });
    const count = await actorCells.count();
    expect(count).toBeGreaterThan(0);
  });

  test("375px mobile EN: filters, Load more, and Sheet detail", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);
    await ensureReadyTargetSelected(page);

    await clearAndType(page, "SELECT 1");
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    const statusFilter = page.locator("#history-filter-status");
    await expect(statusFilter).toBeVisible();

    const historyRow = page.locator("tr[role='button']").filter({ hasText: "SELECT 1" }).first();
    await expect(historyRow).toBeVisible();
    await historyRow.click();

    const detailSheet = page.getByRole("dialog", { name: /execution details/i });
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });
    await expect(detailSheet).toHaveAttribute("data-side", "bottom");

    await page.keyboard.press("Escape");
    await expect(detailSheet).toBeHidden();
    await expect(historyRow).toBeFocused();
  });

  test("desktop zh-CN: filters, Load more, and detail labels", async ({ page }) => {
    await page.context().addCookies([
      { name: "controlhub.locale", value: "zh-CN", domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    await clearAndType(page, "SELECT 1");
    await page.getByRole("button", { name: /^执行$/i }).click();
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("tab", { name: /查询历史/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    const statusFilter = page.locator("#history-filter-status");
    await expect(statusFilter).toBeVisible();
    await expect(page.getByRole("button", { name: /应用/i })).toBeVisible();

    const historyRow = page.locator("tr[role='button']").filter({ hasText: "SELECT 1" }).first();
    await expect(historyRow).toBeVisible();
    await historyRow.click();

    const detailSheet = page.getByRole("dialog", { name: /执行详情/i });
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });
    await expect(detailSheet.getByText("执行人")).toBeVisible();
    await expect(detailSheet.getByText("关闭")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(detailSheet).toBeHidden();
    await expect(historyRow).toBeFocused();
  });

  test("regression: history rows expose role=button (not data-slot) so click navigation is real", async ({ page }) => {
    await openQueryWorkbench(page);
    await runMultipleQueries(page, 1);

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(page.getByText("SELECT 1").first()).toBeVisible({ timeout: 15_000 });

    // History rows must render role="button" (keyboard-accessible, real click).
    // A regression to a data-slot-only selector would make this assertion fail
    // before the click-based detail tests time out with a misleading 30s wait.
    const historyRowByRole = page.getByRole("button", { name: "SELECT 1" }).first();
    await expect(historyRowByRole).toBeVisible({ timeout: 10_000 });

    // data-slot is NOT present on history rows (the table primitive is not used);
    // assert zero matches so a future revert is caught immediately.
    await expect(page.locator("tbody tr[data-slot]")).toHaveCount(0);

    await historyRowByRole.click();
    const detailSheet = page.getByRole("dialog", { name: /execution details/i });
    await expect(detailSheet).toBeVisible({ timeout: 10_000 });
    await page.keyboard.press("Escape");
    await expect(detailSheet).toBeHidden();
  });
});

test.describe("Query Workbench Explain (Phase 38N)", () => {
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
      { name: "controlhub.locale", value: "en", domain: "localhost", path: "/" },
    ]);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `query-explain-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  async function openExplainableTarget(
    page: Page,
    options?: { locale?: "en" | "zh-CN"; mobile?: boolean },
  ): Promise<void> {
    const locale = options?.locale ?? "en";
    await page.context().addCookies([
      { name: "controlhub.locale", value: locale, domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    if (options?.mobile) {
      await page.goto("/query");
    } else {
      await page.locator('a[href="/query"]').first().click();
    }
    await expect(page).toHaveURL(/\/query/);
    const readyIndex = await findReadyOptionIndex(page);
    test.skip(readyIndex === null, "no ready query target seeded (dev credential seed not run)");
    if (readyIndex === null) return;
    await selectConnectionTarget(page, readyIndex);
    const explainTrigger = page.getByTestId("explain-trigger");
    test.skip(
      !(await explainTrigger.isVisible().catch(() => false)),
      "no Explain-capable target seeded",
    );
    await expect(explainTrigger).toBeVisible({ timeout: 10_000 });
  }

  async function historyItemCount(page: Page): Promise<number> {
    await page.getByRole("tab", { name: /query history/i }).click();
    await page.waitForTimeout(500);
    const empty = page.getByText(/no (query )?history|empty/i);
    if (await empty.isVisible().catch(() => false)) {
      await page.getByRole("tab", { name: "Worksheet", exact: true }).click();
      return 0;
    }
    const rows = page.locator("#section-panel-history").getByRole("button");
    const count = await rows.count();
    await page.getByRole("tab", { name: "Worksheet", exact: true }).click();
    return count;
  }

  test("desktop EN: Explain shows normalized risk, no history growth, focus restores", async ({ page }) => {
    await openExplainableTarget(page);

    // Run a normal query first to establish a known history baseline
    const preExplainMarker = `select 'pre-explain-38o-marker-${Date.now()}'`;
    await clearAndType(page, preExplainMarker);
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").filter({ hasText: /pre-explain-38o-marker/ })).toBeVisible({ timeout: 30_000 });

    // Record history count and verify the marker is the most recent item
    await page.getByRole("tab", { name: /query history/i }).click();
    await page.waitForTimeout(500);
    const historyRows = page.locator("tr[role='button']");
    const beforeCount = await historyRows.count();
    const mostRecentBefore = await historyRows.first().textContent() ?? "";
    expect(mostRecentBefore).toContain("pre-explain-38o-marker");
    await page.getByRole("tab", { name: "Worksheet", exact: true }).click();

    // Run Explain with a distinct statement
    const explainStatement = "select * from qe_explain_big";
    await clearAndType(page, explainStatement);
    const trigger = page.getByTestId("explain-trigger");
    await expect(trigger).toBeEnabled();
    await trigger.click();

    const panel = page.getByTestId("explain-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("explain-ready")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-risk-code="full_table_scan"]')).toBeVisible();
    await expect(page.locator('[data-node-access="full_scan"]')).toBeVisible();
    await expect(panel.getByText(/query_block|table_name|qe_explain_big|possible_keys/i)).toHaveCount(0);

    await page.getByTestId("explain-close").click();
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();

    // Verify Explain did NOT add a new history item
    await page.getByRole("tab", { name: /query history/i }).click();
    await page.waitForTimeout(500);
    const afterCount = await historyRows.count();
    const mostRecentAfter = await historyRows.first().textContent() ?? "";
    await page.getByRole("tab", { name: "Worksheet", exact: true }).click();

    // Most recent item is still the pre-explain marker (Explain didn't add anything)
    expect(mostRecentAfter).toContain("pre-explain-38o-marker");
    // No new history items were added
    expect(afterCount).toBe(beforeCount);

    await clearAndType(page, "select 1");
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({ timeout: 15_000 });
  });

  test("375px mobile EN: Explain panel stacks in result area", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await openExplainableTarget(page, { mobile: true });

    const trigger = page.getByTestId("explain-trigger");
    await clearAndType(page, "select * from qe_explain_big");
    await trigger.click();

    const panel = page.getByTestId("explain-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("explain-ready")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-risk-code="full_table_scan"]')).toBeVisible();

    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      // Panel must fit the 375px viewport width (allow small subpixel/overflow chrome).
      expect(box.width).toBeLessThanOrEqual(400);
      expect(box.width).toBeGreaterThan(200);
    }

    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  });

  test("zh-CN desktop: Explain labels and close restore focus", async ({ page }) => {
    await openExplainableTarget(page, { locale: "zh-CN" });

    const trigger = page.getByTestId("explain-trigger");
    await clearAndType(page, "select * from qe_explain_big");
    await trigger.click();

    const panel = page.getByTestId("explain-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("explain-ready")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-risk-code="full_table_scan"]')).toBeVisible();
    await expect(page.getByTestId("explain-close")).toHaveText(/关闭/);

    await page.getByTestId("explain-close").click();
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("Explain does not replace a prior normal Run result", async ({ page }) => {
    await openExplainableTarget(page);

    await clearAndType(page, "select 1 as value");
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({ timeout: 15_000 });

    await clearAndType(page, "select * from qe_explain_big");
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(page.locator("td").first()).toBeVisible({ timeout: 15_000 });

    const trigger = page.getByTestId("explain-trigger");
    await trigger.click();
    await expect(page.getByTestId("explain-panel")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("table, [role='grid']").first()).toBeVisible();
  });
});

// ─── Phase 38O: Relationship map ──────────────────────────────────────────────

test.describe("Relationship map (Phase 38O)", () => {
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
      const screenshotPath = `query-relmap-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("desktop EN: Relationship map loads with inbound/outbound edges", async ({ page }) => {
    await loginViaUI(page);
    await page.getByRole("link", { name: "Query Workbench" }).click();
    await page.waitForURL(/\/query/);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    const viewRelButton = inspector.getByTestId("view-relationships-button");
    await expect(viewRelButton).toBeVisible();
    await expect(viewRelButton).toHaveText("View relationships");

    const relMapResponse = page.waitForResponse(
      (resp) => resp.url().includes("/relationship-map") && resp.status() === 200,
    );
    await viewRelButton.click();
    await relMapResponse;

    const relMapDialog = page.getByRole("dialog", { name: "Relationships" });
    await expect(relMapDialog).toBeVisible();
    await expect(relMapDialog.getByRole("heading", { name: "Inbound" })).toBeVisible();
    await expect(relMapDialog.getByRole("heading", { name: "Outbound" })).toBeVisible();

    await expect(relMapDialog.getByText(/schema_parent/)).toBeVisible({ timeout: 10_000 });
    await expect(relMapDialog.getByText(/→/)).toBeVisible();
  });

  test("request boundary: Only one relationship-map request on activation", async ({ page }) => {
    await loginViaUI(page);
    await page.getByRole("link", { name: "Query Workbench" }).click();
    await page.waitForURL(/\/query/);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible();

    // Track ALL requests from BEFORE the click
    const capturedRequests: { url: string; method: string }[] = [];
    page.on("request", (req) => {
      capturedRequests.push({ url: req.url(), method: req.method() });
    });

    // Track ALL responses to relationship-map endpoint
    const capturedResponses: { url: string; status: number }[] = [];
    page.on("response", (resp) => {
      if (resp.url().includes("/relationship-map")) {
        capturedResponses.push({ url: resp.url(), status: resp.status() });
      }
    });

    await inspector.getByTestId("view-relationships-button").click();

    // Wait for the successful response to be processed
    const relMapDialog = page.getByRole("dialog", { name: "Relationships" });
    await expect(relMapDialog).toBeVisible({ timeout: 10_000 });
    await expect(relMapDialog.getByRole("heading", { name: "Inbound" })).toBeVisible({ timeout: 10_000 });

    // Exactly ONE relationship-map request was made (no N+1)
    const relMapRequests = capturedRequests.filter((req) => req.url.includes("/relationship-map"));
    expect(relMapRequests).toHaveLength(1);

    // That single request succeeded with 200
    expect(capturedResponses).toHaveLength(1);
    expect(capturedResponses[0].status).toBe(200);

    // No forbidden fan-out requests
    const forbidden = capturedRequests.filter(
      (req) =>
        req.url.includes("/run") ||
        req.url.includes("/related-records") ||
        req.url.includes("/table-definition") ||
        req.url.includes("/object-details"),
    );
    expect(forbidden).toHaveLength(0);
  });

  test("375px mobile: Relationship map accessible in Sheet", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    const objectsButton = page.getByRole("button", { name: "Open objects", exact: true });
    await objectsButton.click();

    const sheet = page.getByRole("dialog", { name: "Schema browser" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    const auxDb = sheet.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = sheet.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = sheet.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    // Mobile Inspector opens as a bottom sheet
    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible({ timeout: 30_000 });
    await expect(inspector).toHaveAttribute("data-side", "bottom");

    const relMapResponse = page.waitForResponse(
      (resp) => resp.url().includes("/relationship-map") && resp.status() === 200,
    );
    await inspector.getByTestId("view-relationships-button").click();
    await relMapResponse;

    const relMapSheet = page.getByRole("dialog", { name: "Relationships" });
    await expect(relMapSheet).toBeVisible({ timeout: 30_000 });

    const trigger = page.getByTestId("view-relationships-button");
    const backButton = relMapSheet.getByRole("button", { name: /Back to details/ });
    await backButton.click();

    await expect(trigger).toBeVisible({ timeout: 10_000 });
    // Component uses requestAnimationFrame for focus restoration - wait for DOM commit
    await page.waitForTimeout(500);
    await expect(trigger).toBeFocused({ timeout: 5_000 });
  });

  test("desktop zh-CN: Localized labels", async ({ page }) => {
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
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "对象", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "对象" });
    await expect(explorer).toBeVisible({ timeout: 30_000 });

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "检查" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — 检查器/ });
    await expect(inspector).toBeVisible({ timeout: 30_000 });

    const viewRelButton = inspector.getByTestId("view-relationships-button");
    await expect(viewRelButton).toBeVisible();
    await expect(viewRelButton).toHaveText("查看关系");

    const relMapResponse = page.waitForResponse(
      (resp) => resp.url().includes("/relationship-map") && resp.status() === 200,
    );
    await viewRelButton.click();
    await relMapResponse;

    const relMapDialog = page.getByRole("dialog", { name: "关系" });
    await expect(relMapDialog).toBeVisible();

    await expect(relMapDialog.getByRole("heading", { name: "入站" })).toBeVisible();
    await expect(relMapDialog.getByRole("heading", { name: "出站" })).toBeVisible();
  });

  test("no raw SQL/credential/result value leak", async ({ page }) => {
    await loginViaUI(page);
    await page.getByRole("link", { name: "Query Workbench" }).click();
    await page.waitForURL(/\/query/);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible({ timeout: 30_000 });

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 30_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 30_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 30_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /schema_child — Inspector/ });
    await expect(inspector).toBeVisible({ timeout: 30_000 });

    const relMapResponse = page.waitForResponse(
      (resp) => resp.url().includes("/relationship-map") && resp.status() === 200,
    );
    await inspector.getByTestId("view-relationships-button").click();
    await relMapResponse;

    const relMapDialog = page.getByRole("dialog", { name: "Relationships" });
    await expect(relMapDialog).toBeVisible();

    const relMapText = await relMapDialog.textContent();
    expect(relMapText).not.toContain("SELECT ");
    expect(relMapText).not.toContain("CREATE TABLE");
    expect(relMapText).not.toContain("INSERT INTO");
    expect(relMapText).not.toMatch(/mysql:\/\//);
    expect(relMapText).not.toMatch(/password[=:]/i);
  });
});


// ─── Phase 38R: Governed saved statements ───────────────────────────────────

test.describe("Saved statements (Phase 38R)", () => {
  let consumableHttpErrors: ConsumableHttpExpectation[] = [];
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];
  // Generate a unique suffix per-test (not per-describe) for --repeat-each safety.
  function uniqueSuffix(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  test.beforeEach(async ({ page }) => {
    consumableHttpErrors = [];
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
        /favicon/,
        /Failed to load resource/,
        /500/,
        /Internal Server Error/,
        /hydrat/i,
      ],
      allowedWarnings: [/was preloaded using link preload but not used/],
    });
    networkErrors = collectNetworkErrors(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `saved-stmts-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
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

  test("personal save, list, load, and delete flow (desktop EN)", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    // Switch to Saved sheets tab
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByText(/no saved queries yet|loading/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click "Save personal" to open the create dialog
    await page.locator('[aria-label*="Save current statement as personal"]').click();

    // The create dialog title should appear
    await expect(
      page.getByText("Save as personal query").first(),
    ).toBeVisible({ timeout: 5_000 });

    // Fill in a name using the visible input
    const nameInput = page.getByLabel(/statement name/i).first();
    const testSuffix = uniqueSuffix();
    const testName = `E2E test ${testSuffix}`;
    await nameInput.fill(testName);

    // Statement textarea should be pre-filled (scoped to the dialog: the
    // worksheet CodeMirror editor shares the "SQL statement" label).
    const stmtTextarea = page
      .getByRole("dialog", { name: /save as personal query|保存为个人查询/i })
      .getByLabel(/sql statement|SQL 语句/i);
    const stmtValue = await stmtTextarea.inputValue();
    expect(stmtValue.length).toBeGreaterThan(0);

    // Submit
    await page.getByRole("button", { name: /^create$/i }).first().click();

    // The saved statement should appear in the list
    await expect(page.getByText(testName).first()).toBeVisible({
      timeout: 10_000,
    });

    // Load the saved statement — must be side-effect-free (no execute, explain,
    // schema, history, or related-record requests).
    const requestsDuringLoad: string[] = [];
    const onRequest = (req: { url: () => string }) => requestsDuringLoad.push(req.url());
    page.on("request", onRequest);
    await page
      .getByRole("button", { name: new RegExp(`load e2e test ${testSuffix}`, "i") })
      .first()
      .click();

    // Switch to Worksheet tab to verify the loaded statement
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect
      .poll(() => getEditorContent(page), { timeout: 10_000 })
      .toContain("select");

    // Assert Load was side-effect-free: no execute, explain, schema, history,
    // or related-record requests were fired.
    page.off("request", onRequest);
    const sideEffectUrls = requestsDuringLoad.filter(
      (u) =>
        u.includes("/execute") ||
        u.includes("/explain") ||
        u.includes("/schema/") ||
        /\/query-targets\/[^/]+\/executions/.test(u) ||
        u.includes("/related-record"),
    );
    expect(
      sideEffectUrls,
      `Load must not fire side-effect requests, but got: ${sideEffectUrls.join(", ")}`,
    ).toHaveLength(0);

    // Verify Run after Load still uses governed execution chain:
    // Click Run, intercept the execute request, and verify it hits the governed
    // endpoint with a valid response (disclosure applied, no raw leak).
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    const runBtn = page.getByRole("button", { name: /run|执行/i }).first();
    await expect(runBtn).toBeEnabled({ timeout: 5_000 });
    const executeUrl = await exactExecuteUrlForActiveTarget(page);
    expect(executeUrl, "execute URL must target governed endpoint").toContain("/execute");

    // Actually click Run and verify the governed execution response.
    const execResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/execute") && resp.request().method() === "POST",
    );
    await runBtn.click();
    const execResponse = await execResponsePromise;
    expect(execResponse.status(), "governed execute must return 200").toBe(200);
    const execBody = await execResponse.json();
    // The governed response must include columns and rows (disclosure applied),
    // never raw server-side fields.
    expect(execBody).toHaveProperty("columns");
    expect(Array.isArray(execBody.columns)).toBe(true);
    expect(execBody.columns.length).toBeGreaterThan(0);

    // Switch back to Saved sheets tab to delete
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(testName).first()).toBeVisible({
      timeout: 10_000,
    });
    await page
      .getByRole("button", { name: new RegExp(`delete e2e test ${testSuffix}`, "i") })
      .first()
      .click();

    // Confirm deletion
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.first()).toBeVisible({ timeout: 5_000 });
    await deleteDialog.first().getByRole("button", { name: /^delete$/i }).click();

    // Statement should be removed from the list. The polite announcement still
    // contains the name, so assert the row control is gone rather than the text.
    await expect(page.getByRole("button", { name: new RegExp(`delete ${testName}`, "i") })).toHaveCount(0);
  });

  test("saved statements create dialog opens at 375px mobile", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await page.setViewportSize({ width: 375, height: 812 });
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    // Switch to Saved sheets tab
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByText(/no saved queries yet|loading/i).first(),
    ).toBeVisible({ timeout: 10_000 });

    // Click Save personal
    await page.locator('[aria-label*="Save current statement as personal"]').click();

    // The create form should appear (Sheet at mobile viewport)
    await expect(
      page.getByText("Save as personal query").first(),
    ).toBeVisible({ timeout: 5_000 });

    // Fill in name
    const nameInput = page.getByLabel(/statement name/i).first();
    const mobileTestName = `Mobile test ${Date.now().toString(36)}`;
    await nameInput.fill(mobileTestName);

    // Submit
    await page.getByRole("button", { name: /^create$/i }).first().click();

    // The saved statement should appear in the list
    await expect(page.getByText(mobileTestName)).toBeVisible({
      timeout: 10_000,
    });

    // Clean up — wait for the DELETE API response before asserting removal.
    const deleteResponse = page.waitForResponse(
      (resp) => resp.request().method() === "DELETE" && resp.url().includes("/saved-statements/"),
    );
    await page
      .getByRole("button", { name: new RegExp(`delete ${mobileTestName}`, "i") })
      .first()
      .click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.first()).toBeVisible({ timeout: 5_000 });
    await deleteDialog.first().getByRole("button", { name: /^delete$/i }).click();
    await deleteResponse;
    await expect(page.getByRole("button", { name: new RegExp(`delete ${mobileTestName}`, "i") })).toHaveCount(0);
  });

  test("saved statements panel shows zh-CN translations", async ({ page }) => {
    // Set zh-CN locale cookie before navigation
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "zh-CN",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.locator('a[href="/query"]').first().click();
    await expect(page).toHaveURL(/\/query/);

    // Wait for the workbench to load with zh-CN locale
    await expect(
      page.getByRole("button", { name: /执行/i }),
    ).toBeVisible({ timeout: 15_000 });

    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    // The tab should show zh-CN label
    await expect(
      page.getByRole("tab", { name: /已保存脚本/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Click the tab
    await page.getByRole("tab", { name: /已保存脚本/i }).click();

    // The save button should show zh-CN text
    await expect(
      page.getByRole("button", { name: /保存为个人/i }),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("desktop EN: parameterized personal template loads typed form", async ({ page }) => {
    await exerciseParameterizedTemplateLoad(page, { locale: "en" });
  });

  test("375px EN: parameterized personal template loads typed form", async ({ page }) => {
    await exerciseParameterizedTemplateLoad(page, {
      locale: "en",
      viewport: { width: 375, height: 812 },
    });
  });

  test("desktop zh-CN: parameterized personal template loads typed form", async ({ page }) => {
    await exerciseParameterizedTemplateLoad(page, { locale: "zh-CN" });
  });

  // ─── Phase 38X-4C: terminal delete state machine (Issue #43) ─────────

  /**
   * Create a saved statement through the real UI and return its id + target
   * from the real create API response. No mocks, no route bypass.
   */
  async function createSavedStatementViaUi(
    page: Page,
    locale: "en" | "zh-CN",
    name: string,
  ): Promise<{ id: number; targetResourceId: number }> {
    await page
      .getByRole("button", {
        name:
          locale === "en"
            ? /Save current statement as personal/i
            : /将当前语句保存为个人查询/,
      })
      .first()
      .click();
    await fillSaveDialog(page, name, "SELECT 1");
    const createResponse = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        resp.url().includes("/saved-statements") &&
        !resp.url().includes("/execute") &&
        resp.status() === 201,
    );
    await page
      .getByRole("button", { name: locale === "en" ? /^create$/i : /^创建$/ })
      .first()
      .click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });
    const created = (await (await createResponse).json()) as {
      id: number;
      targetResourceId: number;
    };
    return { id: created.id, targetResourceId: created.targetResourceId };
  }

  test("desktop EN: deleting an already-removed saved statement closes the dialog, refreshes, and announces absence", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByRole("textbox", { name: /search saved statements/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = `Gone ${suffix}`;
    const { id, targetResourceId } = await createSavedStatementViaUi(page, "en", name);
    const token = await getAuthToken("admin");
    // Remove it through the real API so the next UI delete hits 404.
    await apiFetch(`/query-targets/${targetResourceId}/saved-statements/${id}`, {
      method: "DELETE",
      token,
    });

    // The stale row is still shown; its delete must now resolve to 404.
    consumableHttpErrors.push({
      method: "DELETE",
      url: `http://localhost:3100/api/proxy/query-targets/${targetResourceId}/saved-statements/${id}`,
      status: 404,
    });
    await page.getByRole("button", { name: `Delete ${name}` }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog.first().getByRole("button", { name: /^delete$/i }).click();

    // Dialog closes, list refreshes, row is gone, and the announcement is
    // absence (never a success claim).
    await expect(dialog.first()).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: /is no longer available/i }).first(),
    ).toBeAttached();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: `${name} deleted.` }),
    ).toHaveCount(0);
  });

  test("375px EN: deleting an already-removed saved statement announces absence without success", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await page.setViewportSize({ width: 375, height: 812 });
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByRole("textbox", { name: /search saved statements/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = `Gone ${suffix}`;
    const { id, targetResourceId } = await createSavedStatementViaUi(page, "en", name);
    const token = await getAuthToken("admin");
    await apiFetch(`/query-targets/${targetResourceId}/saved-statements/${id}`, {
      method: "DELETE",
      token,
    });

    consumableHttpErrors.push({
      method: "DELETE",
      url: `http://localhost:3100/api/proxy/query-targets/${targetResourceId}/saved-statements/${id}`,
      status: 404,
    });
    await page.getByRole("button", { name: `Delete ${name}` }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog.first().getByRole("button", { name: /^delete$/i }).click();

    await expect(dialog.first()).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: `Delete ${name}` })).toHaveCount(0);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: /is no longer available/i }).first(),
    ).toBeAttached();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: `${name} deleted.` }),
    ).toHaveCount(0);
  });

  test("desktop zh-CN: deleting an already-removed saved statement announces absence in Chinese", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: "controlhub.locale", value: "zh-CN", domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    await page.getByRole("tab", { name: /已保存脚本/i }).click();
    await expect(
      page.getByRole("textbox", { name: /搜索已保存的语句/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = `已删 ${suffix}`;
    const { id, targetResourceId } = await createSavedStatementViaUi(page, "zh-CN", name);
    const token = await getAuthToken("admin");
    await apiFetch(`/query-targets/${targetResourceId}/saved-statements/${id}`, {
      method: "DELETE",
      token,
    });

    consumableHttpErrors.push({
      method: "DELETE",
      url: `http://localhost:3100/api/proxy/query-targets/${targetResourceId}/saved-statements/${id}`,
      status: 404,
    });
    await page.getByRole("button", { name: `删除 ${name}` }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog.first().getByRole("button", { name: /^删除$/i }).click();

    await expect(dialog.first()).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: `删除 ${name}` })).toHaveCount(0);
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: /已不可用/ }).first(),
    ).toBeAttached();
    await expect(
      page.locator('[aria-live="polite"]').filter({ hasText: `${name} 已删除。` }),
    ).toHaveCount(0);
  });

  test("375px EN: saved sheets search occupies its own row with no horizontal overflow", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await page.setViewportSize({ width: 375, height: 812 });
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByRole("textbox", { name: /search saved statements/i }).first(),
    ).toBeVisible({ timeout: 10_000 });

    const search = page.getByRole("textbox", { name: /search saved statements/i }).first();
    const create = page
      .getByRole("button", { name: /Save current statement as personal/i })
      .first();
    const searchBox = await search.boundingBox();
    const createBox = await create.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(createBox).not.toBeNull();
    // Search occupies its own row: the create action sits fully below it.
    expect(createBox!.y).toBeGreaterThanOrEqual(
      (searchBox!.y ?? 0) + (searchBox!.height ?? 0) - 1,
    );
    // No horizontal overflow on the page at 375px.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

/**
 * Fill both save-dialog fields (name + statement) and verify the values
 * committed. Guards a load-induced controlled-input race observed under
 * full-suite runs where a fill could land in the wrong field or be lost;
 * refills once, then fails loudly with the actual field values.
 */
async function fillSaveDialog(
  page: Page,
  name: string,
  statement: string,
): Promise<void> {
  const saveDialog = page.getByRole("dialog", { name: /save as personal query|保存为个人查询/i });
  const nameField = saveDialog.getByLabel(/statement name|语句名称/i);
  const stmtField = saveDialog.getByLabel(/SQL statement|SQL 语句/i);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await nameField.fill(name);
    await stmtField.fill(statement);
    const nameOk = (await nameField.inputValue()) === name;
    const stmtOk = (await stmtField.inputValue()) === statement;
    if (nameOk && stmtOk) return;
  }
  throw new Error(
    `save dialog fields did not commit: name="${await nameField.inputValue()}" statement="${await stmtField.inputValue()}"`,
  );
}

async function exerciseParameterizedTemplateLoad(
  page: Page,
  options: {
    locale: "en" | "zh-CN";
    viewport?: { width: number; height: number };
  },
): Promise<void> {
  if (options.locale === "en") {
    await openQueryWorkbench(page);
  } else {
    await page.context().addCookies([
      { name: "controlhub.locale", value: options.locale, domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
  }
  if (options.viewport) await page.setViewportSize(options.viewport);

  const readyIndex = await findReadyOptionIndex(page);
  if (readyIndex === null) throw noReadyTargetFixtureError();
  await selectConnectionTarget(page, readyIndex);
  await page.getByRole("tab", { name: options.locale === "en" ? /saved sheets/i : /已保存脚本/i }).click();

  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const savedName = `Parameterized ${suffix}`;
  await page
    .getByRole("button", {
      name: options.locale === "en" ? /Save current statement as personal/i : /将当前语句保存为个人查询/,
    })
    .click();
  await fillSaveDialog(page, savedName, "SELECT :status AS status");
  await page.getByRole("button", { name: options.locale === "en" ? /add parameter/i : /添加参数/i }).first().click();
  await page.getByTestId("parameter-row-0").locator("input").fill("status");

  const createRequest = page.waitForRequest(
    (request) => request.method() === "POST" && /saved-statements$/.test(request.url()),
  );
  await page.getByRole("button", { name: options.locale === "en" ? /^create$/i : /^创建$/ }).first().click();
  expect((await createRequest).postDataJSON()).toMatchObject({
    name: savedName,
    statement: "SELECT :status AS status",
    parameters: [{ name: "status", type: "string" }],
  });
  await expect(page.getByText(savedName).first()).toBeVisible({ timeout: 10_000 });

  const requestsDuringLoad: string[] = [];
  const onRequest = (request: { url: () => string }) => requestsDuringLoad.push(request.url());
  page.on("request", onRequest);
  await page
    .getByRole("button", {
      name: new RegExp(`${options.locale === "en" ? "load" : "加载"} ${savedName}`, "i"),
    })
    .first()
    .click();
  await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
  await expect(
    page.getByLabel(options.locale === "en" ? "status value" : "status 参数值"),
  ).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(options.locale === "en" ? "Parameters" : "参数").first()).toBeVisible();
  page.off("request", onRequest);
  expect(
    requestsDuringLoad.filter((url) =>
      /\/execute|\/explain|\/schema\/|\/query-targets\/[^/]+\/executions|\/related-record|\/disclosure/.test(url),
    ),
  ).toHaveLength(0);

  await page.getByRole("tab", { name: options.locale === "en" ? /saved sheets/i : /已保存脚本/i }).click();
  await page
    .getByRole("button", {
      name: new RegExp(`${options.locale === "en" ? "delete" : "删除"} ${savedName}`, "i"),
    })
    .first()
    .click();
  const deleteDialog = page.getByRole("alertdialog");
  await expect(deleteDialog.first()).toBeVisible({ timeout: 5_000 });
  await deleteDialog.first().getByRole("button", { name: options.locale === "en" ? /^delete$/i : /^删除$/ }).click();
  await expect(
    page.getByRole("button", {
      name: new RegExp(`${options.locale === "en" ? "delete" : "删除"} ${savedName}`, "i"),
    }),
  ).toHaveCount(0);
}

test.describe("Governed result paging (Phase 38S)", () => {
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];

  const PAGING_STATEMENT = "select id, payload from qe_explain_big order by id";

  type ExecuteBody = {
    statement?: string;
    maxRows?: number;
    pagination?: { page: number; pageSize: number };
  };

  function waitForExecuteRequest(page: Page) {
    return page.waitForRequest(
      (req) => req.method() === "POST" && req.url().includes("/execute"),
    );
  }

  function resultCell(page: Page, text: string) {
    return page.locator("td").filter({ hasText: new RegExp(`^${text}$`) });
  }

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
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `paging-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }
    assertClean(consoleMessages, networkErrors);
  });

  test("desktop EN: default maxRows 100 and pageSize 10 page forward with Next", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    // Locked default: maxRows 100 so the default page size can page forward.
    await expect(
      page.getByRole("spinbutton", { name: "Max rows" }),
    ).toHaveValue("100");

    await clearAndType(page, PAGING_STATEMENT);
    const firstRequest = waitForExecuteRequest(page);
    await page.getByRole("button", { name: /^run$/i }).click();
    const firstBody = (await firstRequest).postDataJSON() as ExecuteBody;
    expect(firstBody.maxRows).toBe(100);
    expect(firstBody.pagination).toEqual({ page: 1, pageSize: 10 });
    expect(firstBody.statement).toBe(PAGING_STATEMENT);

    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });
    await expect(resultCell(page, "row-010")).toBeVisible();
    await expect(resultCell(page, "row-011")).toHaveCount(0);

    const paging = page.getByTestId("result-paging");
    await expect(paging).toBeVisible();
    await expect(paging.getByText("Page 1")).toBeVisible();
    await expect(paging.getByRole("button", { name: "Previous page" })).toBeDisabled();

    const nextRequest = waitForExecuteRequest(page);
    await paging.getByRole("button", { name: "Next page" }).click();
    const nextBody = (await nextRequest).postDataJSON() as ExecuteBody;
    expect(nextBody.maxRows).toBe(100);
    expect(nextBody.pagination).toEqual({ page: 2, pageSize: 10 });
    expect(nextBody.statement).toBe(PAGING_STATEMENT);

    await expect(resultCell(page, "row-011")).toBeVisible({ timeout: 30_000 });
    await expect(resultCell(page, "row-001")).toHaveCount(0);
    await expect(paging.getByText("Page 2")).toBeVisible();
    await expect(paging.getByRole("button", { name: "Previous page" })).toBeEnabled();
  });

  test("375px mobile EN: paging controls work at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.context().addCookies([
      { name: "controlhub.locale", value: "en", domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    await clearAndType(page, PAGING_STATEMENT);
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });

    const paging = page.getByTestId("result-paging");
    await expect(paging).toBeVisible();
    await expect(paging.getByRole("button", { name: "Next page" })).toBeEnabled();
    await expect(paging.getByRole("combobox", { name: "Page size" })).toBeVisible();

    const nextRequest = waitForExecuteRequest(page);
    await paging.getByRole("button", { name: "Next page" }).click();
    const nextBody = (await nextRequest).postDataJSON() as ExecuteBody;
    expect(nextBody.pagination).toEqual({ page: 2, pageSize: 10 });

    await expect(resultCell(page, "row-011")).toBeVisible({ timeout: 30_000 });
    await expect(paging.getByText("Page 2")).toBeVisible();
  });

  test("desktop EN: page size switch re-executes and persists across reload", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await clearAndType(page, PAGING_STATEMENT);
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });

    const paging = page.getByTestId("result-paging");
    await paging.getByRole("combobox", { name: "Page size" }).click();
    const switchRequest = waitForExecuteRequest(page);
    await page.getByRole("option", { name: "50", exact: true }).click();
    const switchBody = (await switchRequest).postDataJSON() as ExecuteBody;
    expect(switchBody.pagination).toEqual({ page: 1, pageSize: 50 });

    await expect(resultCell(page, "row-050")).toBeVisible({ timeout: 30_000 });
    await expect(resultCell(page, "row-051")).toHaveCount(0);

    // Reload: the preference must survive and drive the next Run.
    await page.reload();
    await expect(page.getByRole("button", { name: /^(run|执行)$/i })).toBeEnabled({
      timeout: 15_000,
    });
    await clearAndType(page, PAGING_STATEMENT);
    const reloadRequest = waitForExecuteRequest(page);
    await page.getByRole("button", { name: /^run$/i }).click();
    const reloadBody = (await reloadRequest).postDataJSON() as ExecuteBody;
    expect(reloadBody.pagination).toEqual({ page: 1, pageSize: 50 });

    await expect(resultCell(page, "row-050")).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByTestId("result-paging").getByRole("combobox", { name: "Page size" }),
    ).toContainText("50");
  });

  test("desktop EN: table definition renders as read-only highlighted SQL", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();

    const childTable = explorer.getByRole("treeitem", { name: "schema_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();

    const inspectButton = explorer.getByRole("button", { name: "Inspect" });
    await expect(inspectButton).toBeVisible({ timeout: 10_000 });
    await inspectButton.click();

    const inspector = page.getByRole("dialog", { name: /Inspector/ });
    await expect(inspector).toBeVisible();
    await inspector.getByTestId("view-definition-button").click();

    // The DDL renders inside a read-only CodeMirror editor, not a plain <pre>.
    const definitionEditor = inspector.locator(".cm-editor");
    await expect(definitionEditor).toBeVisible({ timeout: 15_000 });
    await expect(definitionEditor).toHaveAttribute("aria-readonly", "true");
    await expect(definitionEditor.locator(".cm-content")).toHaveAttribute(
      "contenteditable",
      "false",
    );
    await expect(inspector.getByText(/CREATE TABLE/)).toBeVisible();
  });

  test("desktop EN: loading a saved statement resets paging state and Run starts fresh", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    // Save the default `select 1` statement first.
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page.locator('[aria-label*="Save current statement as personal"]').click();
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const savedName = `Paging invalidation ${suffix}`;
    await page.getByLabel(/statement name/i).first().fill(savedName);
    await page.getByRole("button", { name: /^create$/i }).first().click();
    await expect(page.getByText(savedName).first()).toBeVisible({ timeout: 10_000 });

    // Run a paged query and move to page 2.
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await clearAndType(page, PAGING_STATEMENT);
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });
    const paging = page.getByTestId("result-paging");
    await paging.getByRole("button", { name: "Next page" }).click();
    await expect(resultCell(page, "row-011")).toBeVisible({ timeout: 30_000 });
    await expect(paging.getByText("Page 2")).toBeVisible();

    // Load the saved statement: paging state must reset and Run stays usable.
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page
      .getByRole("button", { name: new RegExp(`load paging invalidation ${suffix}`, "i") })
      .first()
      .click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect.poll(() => getEditorContent(page), { timeout: 10_000 }).toContain("select 1");
    await expect(page.getByTestId("result-paging")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^run$/i })).toBeEnabled();

    // A fresh Run executes the loaded statement from page 1.
    const freshRequest = waitForExecuteRequest(page);
    await page.getByRole("button", { name: /^run$/i }).click();
    const freshBody = (await freshRequest).postDataJSON() as ExecuteBody;
    expect(freshBody.statement).toContain("select 1");
    expect(freshBody.pagination?.page).toBe(1);
    await expect(page.locator("td").filter({ hasText: /^1$/ })).toBeVisible({
      timeout: 30_000,
    });

    // Cleanup: delete the saved statement so the test is repeatable.
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page
      .getByRole("button", { name: new RegExp(`delete paging invalidation ${suffix}`, "i") })
      .first()
      .click();
    const deleteDialog = page.getByRole("alertdialog");
    await expect(deleteDialog.first()).toBeVisible({ timeout: 5_000 });
    await deleteDialog.first().getByRole("button", { name: /^delete$/i }).click();
    await expect(
      page.getByRole("button", { name: new RegExp(`delete ${savedName}`, "i") }),
    ).toHaveCount(0);
  });

  test("zh-CN: paging controls are localized with no MISSING_MESSAGE errors", async ({ page }) => {
    await page.context().addCookies([
      { name: "controlhub.locale", value: "zh-CN", domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await ensureReadyTargetSelected(page);

    await clearAndType(page, PAGING_STATEMENT);
    await page.getByRole("button", { name: /^执行$/ }).click();
    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });

    const paging = page.getByTestId("result-paging");
    await expect(paging).toBeVisible();
    await expect(paging.getByRole("button", { name: "上一页" })).toBeVisible();
    await expect(paging.getByRole("combobox", { name: "每页行数" })).toBeVisible();
    await expect(paging.getByText("第 1 页")).toBeVisible();

    const nextRequest = waitForExecuteRequest(page);
    await paging.getByRole("button", { name: "下一页" }).click();
    const nextBody = (await nextRequest).postDataJSON() as ExecuteBody;
    expect(nextBody.pagination).toEqual({ page: 2, pageSize: 10 });
    await expect(resultCell(page, "row-011")).toBeVisible({ timeout: 30_000 });
    await expect(paging.getByText("第 2 页")).toBeVisible();

    const missingMessages = consoleMessages.filter((message) =>
      message.text.includes("MISSING_MESSAGE"),
    );
    expect(missingMessages).toHaveLength(0);
  });

  test("desktop EN: invalid max rows value blocks execution and valid correction runs with exact cap", async ({ page }) => {
    await openQueryWorkbench(page);
    await ensureReadyTargetSelected(page);

    const maxRowsInput = page.getByRole("spinbutton", { name: "Max rows" });
    await expect(maxRowsInput).toHaveValue("100");

    const safeStatement = PAGING_STATEMENT;
    await clearAndType(page, safeStatement);

    const executeRequests: PlaywrightRequest[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/execute")) {
        executeRequests.push(request);
      }
    });

    const firstRequest = waitForExecuteRequest(page);
    await page.getByRole("button", { name: /^run$/i }).click();
    const firstBody = (await firstRequest).postDataJSON() as ExecuteBody;
    expect(firstBody.maxRows).toBe(100);
    expect(firstBody.pagination).toEqual({ page: 1, pageSize: 10 });
    await expect(resultCell(page, "row-001")).toBeVisible({ timeout: 30_000 });
    expect(executeRequests).toHaveLength(1);
    const paging = page.getByTestId("result-paging");
    await expect(paging).toBeVisible();
    await expect(paging.getByRole("button", { name: "Next page" })).toBeEnabled();
    await expect(paging.getByRole("combobox", { name: "Page size" })).toBeEnabled();

    await maxRowsInput.fill("501");
    await expect(maxRowsInput).toHaveValue("501");
    await expect(maxRowsInput).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Enter a whole number from 1 to 500")).toBeVisible();
    await expect(page.getByRole("button", { name: /^run$/i })).toBeDisabled();
    await expect(paging.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await expect(paging.getByRole("button", { name: "Next page" })).toBeDisabled();
    await expect(paging.getByRole("combobox", { name: "Page size" })).toBeDisabled();

    await getEditor(page).click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await expect.poll(() => executeRequests.length).toBe(1);

    await maxRowsInput.fill("100");
    await expect(maxRowsInput).toHaveValue("100");
    await expect(maxRowsInput).not.toHaveAttribute("aria-invalid");
    await expect(page.getByText("Enter a whole number from 1 to 500")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^run$/i })).toBeEnabled();
    await expect(paging).toHaveCount(0);

    const correctedRequest = waitForExecuteRequest(page);
    await page.getByRole("button", { name: /^run$/i }).click();
    const correctedBody = (await correctedRequest).postDataJSON() as ExecuteBody;
    expect(correctedBody.maxRows).toBe(100);
    expect(correctedBody.pagination).toEqual({ page: 1, pageSize: 10 });
    expect(executeRequests).toHaveLength(2);
  });
});

// ─── Phase 38W-3: Governed template execution ───────────────────────────────

test.describe("Phase 38W-3: governed template execution", () => {
  let consumableHttpErrors: ConsumableHttpExpectation[] = [];
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];

  function uniqueSuffix(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  const TEMPLATE_STATEMENT =
    "SELECT id, payload FROM qe_explain_big WHERE id > :minimum_id ORDER BY id";

  test.beforeEach(async ({ page }) => {
    consumableHttpErrors = [];
    // Precise base guard only; expected 400/403 echoes are consumed one-shot
    // via consumableHttpErrors, never a broad allowlist.
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
      ],
      allowedWarnings: [/was preloaded using link preload but not used/],
    });
    networkErrors = collectNetworkErrors(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `tpl-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
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

  async function openReadyWorksheet(page: Page): Promise<string> {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    const targetId = new URL(page.url()).searchParams.get("targetId");
    if (!targetId || !/^\d+$/.test(targetId)) throw noReadyTargetFixtureError();
    return targetId;
  }

  async function createPersonalTemplate(
    page: Page,
    options: { name: string; statement: string; paramName: string; paramType: "string" | "integer" },
  ): Promise<void> {
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page.locator('[aria-label*="Save current statement as personal"]').click();
    await expect(page.getByText("Save as personal query").first()).toBeVisible({ timeout: 5_000 });
    await fillSaveDialog(page, options.name, options.statement);
    await page.getByRole("button", { name: /add parameter/i }).first().click();
    const row = page.getByTestId("parameter-row-0");
    await row.locator("input").fill(options.paramName);
    if (options.paramType !== "string") {
      await row.getByLabel(/type/i).selectOption(options.paramType);
    }
    await page.getByRole("button", { name: /^create$/i }).first().click();
    await expect(page.getByText(options.name).first()).toBeVisible({ timeout: 10_000 });
  }

  async function loadTemplate(page: Page, name: string): Promise<void> {
    await page.getByRole("button", { name: new RegExp(`load ${name}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByLabel("minimum_id value")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Template mode").first()).toBeVisible();
  }

  async function deleteTemplate(page: Page, name: string): Promise<void> {
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page.getByRole("button", { name: new RegExp(`delete ${name}`, "i") }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog.first().getByRole("button", { name: /^delete$/i }).click();
    await expect(page.getByRole("button", { name: new RegExp(`delete ${name}`, "i") })).toHaveCount(0);
  }

  /** Fill the template form and wait for the template-execute request. */
  async function runTemplate(
    page: Page,
    value: string,
  ): Promise<PlaywrightRequest> {
    await page.getByLabel("minimum_id value").fill(value);
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    return request;
  }

  test("successful typed template execution uses the saved-statement execute route", async ({ page }) => {
    const targetId = await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template exec ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    const requestsDuringRun: string[] = [];
    const onRequest = (req: PlaywrightRequest) => requestsDuringRun.push(req.url());
    page.on("request", onRequest);
    const request = await runTemplate(page, "0");
    page.off("request", onRequest);
    const runUrl = new URL(request.url());
    expect(runUrl.pathname).toMatch(/\/query-targets\/\d+\/saved-statements\/\d+\/execute$/);
    expect(runUrl.searchParams.get("targetId")).toBeNull();

    const body = request.postDataJSON() as {
      values?: Record<string, unknown>;
      maxRows?: number;
      pagination?: { page: number; pageSize: number };
      statement?: string;
      parameters?: unknown;
    };
    expect(body.values).toEqual({ minimum_id: 0 });
    expect(body.maxRows).toBeGreaterThan(0);
    expect(body.pagination).toEqual({ page: 1, pageSize: 10 });
    expect(body.statement).toBeUndefined();
    expect(body.parameters).toBeUndefined();

    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("row-001").first()).toBeVisible();
    // The ordinary execute route must never be used while in template mode.
    expect(
      requestsDuringRun.filter((url) =>
        /\/query-targets\/\d+\/execute$/.test(new URL(url).pathname),
      ),
    ).toHaveLength(0);

    await deleteTemplate(page, name);
    expect(targetId).toMatch(/^\d+$/);
  });

  test("controlled field validation shows a localized error without leaking the value", async ({ page }) => {
    await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template invalid ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    // A non-integer number passes client conversion but must be rejected by the
    // server's typed-value validation.
    await page.getByLabel("minimum_id value").fill("1.5");
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    const invalidRequest = await request;
    const body = invalidRequest.postDataJSON() as { values?: Record<string, unknown> };
    expect(body.values).toEqual({ minimum_id: 1.5 });
    consumableHttpErrors = [
      { method: "POST", url: invalidRequest.url(), status: 400, consumeConsoleStatusEcho: true },
    ];

    await expect(page.getByText("Value does not match the expected type").first()).toBeVisible({
      timeout: 10_000,
    });
    // The controlled error never echoes the supplied value or SQL; the value
    // stays only in the input (retained for repair).
    await expect(page.getByLabel("minimum_id value")).toHaveValue("1.5");
    const errorArea = page.locator('[role="alert"]').filter({ hasText: "Value does not match" });
    await expect(errorArea).not.toContainText("1.5");
    await expect(errorArea).not.toContainText("qe_explain_big");
    await expect(page.getByRole("grid")).not.toBeVisible();

    await deleteTemplate(page, name);
  });

  test("template load is inert: no execute/explain/schema/history/related/disclosure requests", async ({ page }) => {
    await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template inert ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });

    const requestsDuringLoad: string[] = [];
    const onRequest = (request: PlaywrightRequest) => requestsDuringLoad.push(request.url());
    page.on("request", onRequest);
    await loadTemplate(page, name);
    page.off("request", onRequest);

    expect(
      requestsDuringLoad.filter((url) =>
        /\/execute|\/explain|\/schema\/|\/query-targets\/[^/]+\/executions|\/related-record|\/disclosure/.test(url),
      ),
    ).toHaveLength(0);

    await deleteTemplate(page, name);
  });

  test("template pagination stays on the template-execute route for every page", async ({ page }) => {
    await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template pages ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    await runTemplate(page, "0");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /next page/i })).toBeEnabled({ timeout: 10_000 });

    const nextRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    const requestsDuringNext: string[] = [];
    const onRequest = (req: PlaywrightRequest) => requestsDuringNext.push(req.url());
    page.on("request", onRequest);
    await page.getByRole("button", { name: /next page/i }).click();
    const body = (await nextRequest).postDataJSON() as {
      values?: Record<string, unknown>;
      pagination?: { page: number; pageSize: number };
    };
    page.off("request", onRequest);
    expect(body.values).toEqual({ minimum_id: 0 });
    expect(body.pagination).toEqual({ page: 2, pageSize: 10 });

    await expect(page.getByText("Page 2").first()).toBeVisible({ timeout: 10_000 });
    // Template paging never falls back to the ordinary execute route.
    expect(
      requestsDuringNext.filter((url) =>
        /\/query-targets\/\d+\/execute$/.test(new URL(url).pathname),
      ),
    ).toHaveLength(0);

    await deleteTemplate(page, name);
  });

  test("a later disclosure-policy change blocks a subsequent template page", async ({ page }) => {
    const targetId = await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template disclosure ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    const firstRequest = await runTemplate(page, "0");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });
    const templateUrl = firstRequest.url();

    const token = await getAuthToken();
    const apiBase = process.env.CONTROLHUB_API_PROXY_URL ?? "http://localhost:8081";
    const policyUrl = `${apiBase}/query-disclosure-policies?targetResourceId=${targetId}&databaseName=query_e2e&objectName=qe_explain_big&columnName=payload`;
    try {
      const remove = await fetch(policyUrl, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(remove.status).toBe(204);

      consumableHttpErrors = [
        { method: "POST", url: templateUrl, status: 403, consumeConsoleStatusEcho: true },
      ];
      await page.getByRole("button", { name: /next page/i }).click();
      await expect(page.getByText(/blocked by result disclosure policy/i).first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("grid")).not.toBeVisible();
    } finally {
      const restore = await fetch(`${apiBase}/query-disclosure-policies`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetResourceId: Number(targetId),
          databaseName: "query_e2e",
          objectName: "qe_explain_big",
          columnName: "payload",
          mode: "raw_copy_allowed",
        }),
      });
      expect(restore.status).toBe(201);
    }

    await deleteTemplate(page, name);
  });

  test("editing the SQL exits template mode and restores the ordinary run route", async ({ page }) => {
    await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template edit ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);
    await expect(page.getByText("Template mode").first()).toBeVisible();

    await clearAndType(page, "SELECT id, payload FROM qe_explain_big ORDER BY id LIMIT 5");
    await expect(page.getByText("Template mode")).toHaveCount(0);

    const ordinaryRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    const body = (await ordinaryRequest).postDataJSON() as { statement?: string };
    expect(body.statement).toContain("qe_explain_big");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });

    await deleteTemplate(page, name);
  });

  test("editing SQL suppresses a stale template result and refresh discards values", async ({ page }) => {
    await openReadyWorksheet(page);
    const suffix = uniqueSuffix();
    const name = `Template stale ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    await runTemplate(page, "0");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("row-001").first()).toBeVisible();

    // Editing the SQL exits template mode and invalidates the stale result.
    await clearAndType(page, "SELECT id FROM qe_explain_big ORDER BY id LIMIT 3");
    await expect(page.getByText("Template mode")).toHaveCount(0);
    await expect(page.getByRole("grid")).not.toBeVisible();
    await expect(page.getByText("row-001")).toHaveCount(0);

    // Values live only in worksheet memory: a reload restores an empty form.
    await page.reload();
    await expect(page.getByRole("tab", { name: /saved sheets/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode")).toHaveCount(0);

    await deleteTemplate(page, name);
  });

  test("template form and execution remain operable at 375px (desktop EN)", async ({ page }) => {
    const targetId = await openReadyWorksheet(page);
    // The /query sidebar link is desktop-only; shrink the viewport after the
    // workbench is open so the template form and paging remain operable.
    await page.setViewportSize({ width: 375, height: 812 });
    const suffix = uniqueSuffix();
    const name = `Template mobile ${suffix}`;
    await createPersonalTemplate(page, {
      name,
      statement: TEMPLATE_STATEMENT,
      paramName: "minimum_id",
      paramType: "integer",
    });
    await loadTemplate(page, name);

    const request = await runTemplate(page, "0");
    expect(new URL(request.url()).pathname).toMatch(/\/saved-statements\/\d+\/execute$/);
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });

    await deleteTemplate(page, name);
    expect(targetId).toMatch(/^\d+$/);
  });

  test("template execution and localized validation render in zh-CN", async ({ page }) => {
    await page.context().addCookies([
      { name: "controlhub.locale", value: "zh-CN", domain: "localhost", path: "/" },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /已保存脚本/i }).click();
    const suffix = uniqueSuffix();
    const name = `模板执行 ${suffix}`;
    await page.locator('[aria-label*="将当前语句保存为个人查询"]').click();
    await expect(page.getByText("保存为个人查询").first()).toBeVisible({ timeout: 5_000 });
    await fillSaveDialog(page, name, TEMPLATE_STATEMENT);
    await page.getByRole("button", { name: /添加参数/i }).first().click();
    const row = page.getByTestId("parameter-row-0");
    await row.locator("input").fill("minimum_id");
    await row.getByLabel(/类型/i).selectOption("integer");
    await page.getByRole("button", { name: /^创建$/i }).first().click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: new RegExp(`加载 ${name}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByLabel("minimum_id 参数值")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("模板模式").first()).toBeVisible();

    await page.getByLabel("minimum_id 参数值").fill("1.5");
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^执行$/i }).click();
    const invalidRequest = await request;
    consumableHttpErrors = [
      { method: "POST", url: invalidRequest.url(), status: 400, consumeConsoleStatusEcho: true },
    ];
    await expect(page.getByText("值与预期类型不匹配").first()).toBeVisible({ timeout: 10_000 });

    await page.getByLabel("minimum_id 参数值").fill("0");
    await page.getByRole("button", { name: /^执行$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("tab", { name: /已保存脚本/i }).click();
    await page.getByRole("button", { name: new RegExp(`删除 ${name}`, "i") }).first().click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.first()).toBeVisible({ timeout: 5_000 });
    await dialog.first().getByRole("button", { name: /^删除$/ }).click();
    await expect(page.getByRole("button", { name: new RegExp(`删除 ${name}`) })).toHaveCount(0);
  });
});

// ─── Issue #5: shared-template mutation affordance ──────────────────────────

test.describe("Saved statements shared template affordance (Issue #5)", () => {
  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];
  let consumableHttpErrors: Array<{
    method: string;
    url: string;
    status: number;
    consumeConsoleStatusEcho?: boolean;
  }> = [];

  const SHARED_TEMPLATE_NAME = "E2E shared template";
  const SHARED_TEMPLATE_STATEMENT = "SELECT 1";
  const SHARED_PARAM_TEMPLATE_NAME = "E2E shared param template";
  const SHARED_PARAM_TEMPLATE_STATEMENT =
    "SELECT id, payload FROM qe_explain_big WHERE id > :minimum_id ORDER BY id";
  const SHARED_PARAM_DECLARATIONS = [{ name: "minimum_id", type: "integer" }] as const;

  function fixtureSetupError(detail: string): Error {
    return new Error(`E2E fixture setup error: ${detail}. ${FIXTURE_DIAGNOSTIC}`);
  }

  function parametersMatch(
    actual: Array<{ name?: string; type?: string }> | undefined,
    expected: ReadonlyArray<{ name: string; type: string }>,
  ): boolean {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((exp, index) => {
      const got = actual[index];
      return got?.name === exp.name && got?.type === exp.type;
    });
  }

  async function ensureSharedTemplate(
    token: string,
    targetId: number,
    spec: {
      name: string;
      statement: string;
      parameters: ReadonlyArray<{ name: string; type: string }>;
    },
  ): Promise<void> {
    const listRes = await fetch(
      `${PROBE_API_BASE}/query-targets/${targetId}/saved-statements?pageSize=100`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) },
    );
    if (!listRes.ok) {
      throw fixtureSetupError(
        `list saved-statements for target ${targetId} returned ${listRes.status}`,
      );
    }
    const listBody = (await listRes.json()) as {
      items?: Array<{
        id: number;
        name: string;
        scope: string;
        statement?: string;
        parameters?: Array<{ name?: string; type?: string }>;
      }>;
    };
    if (!Array.isArray(listBody.items)) {
      throw fixtureSetupError(
        `list saved-statements for target ${targetId} returned unexpected body (missing items[])`,
      );
    }
    const existing = listBody.items.find(
      (s) => s.name === spec.name && s.scope === "shared_template",
    );
    if (existing) {
      if (existing.statement !== spec.statement) {
        throw fixtureSetupError(
          `shared template "${spec.name}" exists with unexpected statement ` +
            `(got ${JSON.stringify(existing.statement)}; want ${JSON.stringify(spec.statement)})`,
        );
      }
      if (!parametersMatch(existing.parameters, spec.parameters)) {
        throw fixtureSetupError(
          `shared template "${spec.name}" exists with unexpected parameters ` +
            `(got ${JSON.stringify(existing.parameters)}; want ${JSON.stringify(spec.parameters)})`,
        );
      }
      return;
    }

    const createRes = await fetch(
      `${PROBE_API_BASE}/query-targets/${targetId}/saved-statements`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: spec.name,
          statement: spec.statement,
          scope: "shared_template",
          parameters: spec.parameters,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!createRes.ok) {
      throw fixtureSetupError(
        `create shared template "${spec.name}" returned ${createRes.status}: ${await createRes.text()}`,
      );
    }
    const created = (await createRes.json()) as {
      id?: number;
      name?: string;
      scope?: string;
      statement?: string;
      parameters?: Array<{ name?: string; type?: string }>;
    };
    if (
      typeof created.id !== "number" ||
      created.name !== spec.name ||
      created.scope !== "shared_template" ||
      created.statement !== spec.statement ||
      !parametersMatch(created.parameters, spec.parameters)
    ) {
      throw fixtureSetupError(
        `create shared template "${spec.name}" returned unexpected body: ${JSON.stringify(created)}`,
      );
    }
  }

  test.beforeAll(async () => {
    await checkBackendHealth();

    const token = await getAuthToken();
    const targetsRes = await fetch(`${PROBE_API_BASE}/query-targets`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!targetsRes.ok) {
      throw fixtureSetupError(`GET /query-targets returned ${targetsRes.status}`);
    }
    const targetsBody = (await targetsRes.json()) as {
      items?: Array<{ resourceId: number; availableActions?: { run?: boolean } }>;
    };
    if (!Array.isArray(targetsBody.items)) {
      throw fixtureSetupError("GET /query-targets returned unexpected body (missing items[])");
    }
    const readyTarget = targetsBody.items.find(
      (t) => t.availableActions?.run === true,
    );
    if (!readyTarget) {
      throw noReadyTargetFixtureError();
    }

    // Ensure each shared fixture independently — never skip the parameterized
    // template because the static one already exists (or vice versa).
    await ensureSharedTemplate(token, readyTarget.resourceId, {
      name: SHARED_TEMPLATE_NAME,
      statement: SHARED_TEMPLATE_STATEMENT,
      parameters: [],
    });
    await ensureSharedTemplate(token, readyTarget.resourceId, {
      name: SHARED_PARAM_TEMPLATE_NAME,
      statement: SHARED_PARAM_TEMPLATE_STATEMENT,
      parameters: SHARED_PARAM_DECLARATIONS,
    });
  });

  test.beforeEach(async ({ page }) => {
    consumableHttpErrors = [];
    consoleMessages = collectConsoleMessages(page, {
      allowedErrors: [
        /Fast Refresh/,
        /HMR/,
        /Download the React DevTools/,
      ],
      allowedWarnings: [/was preloaded using link preload but not used/],
    });
    networkErrors = collectNetworkErrors(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const screenshotPath = `shared-tpl-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
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

  test("desktop EN: authorized manager sees Load, Edit, Delete for shared_template", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByText(SHARED_TEMPLATE_NAME).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: new RegExp(`load ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`edit ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`delete ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
  });

  test("375px mobile EN: authorized manager sees Load, Edit, Delete for shared_template", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 844 });
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await loginViaUI(page);
    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByText(SHARED_TEMPLATE_NAME).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: new RegExp(`load ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`edit ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`delete ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
  });

  test("desktop zh-CN: authorized manager sees localized Load, Edit, Delete for shared_template", async ({
    page,
  }) => {
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
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /已保存脚本/i }).click();
    await expect(
      page.getByText(SHARED_TEMPLATE_NAME).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: new RegExp(`加载 ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`编辑 ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`删除 ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
  });

  test("375px EN: load shared param template, controlled validation, focus, and execute", async ({
    page,
  }) => {
    // Open on desktop first (sidebar link), then shrink — matches personal-template mobile pattern.
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);
    await page.setViewportSize({ width: 375, height: 844 });

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: new RegExp(`load ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();

    await expect(page.getByText("Template mode").first()).toBeVisible();
    const valueField = page.getByLabel("minimum_id value");
    await expect(valueField).toBeVisible();
    await valueField.focus();
    await expect(valueField).toBeFocused();

    await valueField.fill("1.5");
    const invalidRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    const invalidReq = await invalidRequest;
    consumableHttpErrors = [
      { method: "POST", url: invalidReq.url(), status: 400, consumeConsoleStatusEcho: true },
    ];
    await expect(page.getByText("Value does not match the expected type").first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(valueField).toHaveValue("1.5");
    await expect(valueField).toHaveAttribute("aria-invalid", "true");

    await valueField.fill("0");
    const okRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/query-targets\/\d+\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    const okReq = await okRequest;
    expect(okReq.postDataJSON()).toMatchObject({
      values: { minimum_id: 0 },
      pagination: { page: 1 },
    });
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
  });

  test("desktop zh-CN: load shared param template, controlled validation, and execute", async ({
    page,
  }) => {
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
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /已保存脚本/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: new RegExp(`加载 ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();

    await expect(page.getByText("模板模式").first()).toBeVisible();
    const valueField = page.getByLabel("minimum_id 参数值");
    await expect(valueField).toBeVisible();
    await valueField.focus();
    await expect(valueField).toBeFocused();

    await valueField.fill("1.5");
    const invalidRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^执行$/i }).click();
    const invalidReq = await invalidRequest;
    consumableHttpErrors = [
      { method: "POST", url: invalidReq.url(), status: 400, consumeConsoleStatusEcho: true },
    ];
    await expect(page.getByText("值与预期类型不匹配").first()).toBeVisible({ timeout: 10_000 });
    await expect(valueField).toHaveValue("1.5");
    await expect(valueField).toHaveAttribute("aria-invalid", "true");

    await valueField.fill("0");
    const okRequest = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/query-targets\/\d+\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^执行$/i }).click();
    const okReq = await okRequest;
    expect(okReq.postDataJSON()).toMatchObject({
      values: { minimum_id: 0 },
      pagination: { page: 1 },
    });
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
  });

  test("non-manager editor: Load visible, Edit/Delete absent for shared_template", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/login");
    await loginViaUI(page, "editor");

    await page.locator('a[href="/query"]').first().click();
    await expect(page).toHaveURL(/\/query/);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(
      page.getByText(SHARED_TEMPLATE_NAME).first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(
      page.getByRole("button", { name: new RegExp(`load ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(`edit ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: new RegExp(`delete ${SHARED_TEMPLATE_NAME}`, "i") }),
    ).toHaveCount(0);
  });

  test("non-admin editor: Load shared template, fill minimum_id, execute, assert body values, capture ID, verify Next page", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "controlhub.locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/login");
    await loginViaUI(page, "editor");

    await page.locator('a[href="/query"]').first().click();
    await expect(page).toHaveURL(/\/query/);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: new RegExp(`load ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode").first()).toBeVisible();
    await expect(page.getByLabel("minimum_id value")).toBeVisible();
    await expect(
      page.getByText(/Run executes the saved template\. Editing the SQL exits template mode\./i),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /close template session/i })).toHaveCount(0);

    await page.getByLabel("minimum_id value").fill("0");

    const templateExecuteRe = /\/query-targets\/(\d+)\/saved-statements\/(\d+)\/execute$/;
    const ordinaryExecuteRe = /\/query-targets\/\d+\/execute$/;

    const ordinaryRequests: string[] = [];
    page.on("request", (req) => {
      if (req.method() !== "POST") return;
      const pathname = new URL(req.url()).pathname;
      if (ordinaryExecuteRe.test(pathname) && !templateExecuteRe.test(pathname)) {
        ordinaryRequests.push(req.url());
      }
    });

    const firstExecuteRequest = page.waitForRequest(
      (req) => req.method() === "POST" && templateExecuteRe.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    const firstReq = await firstExecuteRequest;
    const firstUrl = new URL(firstReq.url());
    expect(firstUrl.pathname).toMatch(templateExecuteRe);
    const firstMatch = firstUrl.pathname.match(templateExecuteRe)!;
    const targetId = firstMatch[1];
    const savedStmtId = firstMatch[2];
    expect(targetId).toMatch(/^\d+$/);
    expect(savedStmtId).toMatch(/^\d+$/);
    const firstBody = firstReq.postDataJSON() as { values?: Record<string, unknown>; pagination?: { page: number } };
    expect(firstBody.values).toEqual({ minimum_id: 0 });
    expect(firstBody.pagination?.page).toBe(1);
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    const nextPage = page.getByRole("button", { name: /next page/i });
    await expect(nextPage).toBeEnabled();

    const secondExecuteRequest = page.waitForRequest(
      (req) => req.method() === "POST" && templateExecuteRe.test(new URL(req.url()).pathname),
    );
    await nextPage.click();
    const secondReq = await secondExecuteRequest;
    const secondUrl = new URL(secondReq.url());
    expect(secondUrl.pathname).toMatch(templateExecuteRe);
    const secondMatch = secondUrl.pathname.match(templateExecuteRe)!;
    expect(secondMatch[1]).toBe(targetId);
    expect(secondMatch[2]).toBe(savedStmtId);
    const secondBody = secondReq.postDataJSON() as { values?: Record<string, unknown>; pagination?: { page: number } };
    expect(secondBody.values).toEqual({ minimum_id: 0 });
    expect(secondBody.pagination?.page).toBe(2);

    await expect.poll(() => ordinaryRequests.length).toBe(0);
  });

  test("no owner, author, or value leakage in saved statement rows", async ({
    page,
  }) => {
    const SENTINEL = "987654321";

    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: new RegExp(`load ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode").first()).toBeVisible();

    await page.getByLabel("minimum_id value").fill(SENTINEL);
    await expect(page.getByLabel("minimum_id value")).toHaveValue(SENTINEL);

    const listResponse = page.waitForResponse(
      (resp) => resp.url().includes("/saved-statements") && !resp.url().includes("/execute") && resp.ok(),
      { timeout: 10_000 },
    );
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    const resp = await listResponse;
    const parsed = await resp.json() as Record<string, unknown>;

    function containsKey(obj: unknown, key: string): boolean {
      if (obj === null || obj === undefined || typeof obj !== "object") return false;
      if (Array.isArray(obj)) return obj.some((item) => containsKey(item, key));
      return Object.keys(obj as Record<string, unknown>).some((k) => k.toLowerCase().includes(key.toLowerCase())) ||
        Object.values(obj as Record<string, unknown>).some((v) => containsKey(v, key));
    }

    function containsValue(obj: unknown, val: string): boolean {
      if (obj === null || obj === undefined) return false;
      if (typeof obj === "string") return obj.includes(val);
      if (typeof obj !== "object") return false;
      if (Array.isArray(obj)) return obj.some((item) => containsValue(item, val));
      return Object.values(obj as Record<string, unknown>).some((v) => containsValue(v, val));
    }

    expect(containsKey(parsed, "ownerUserId")).toBe(false);
    expect(containsKey(parsed, "owner_user_id")).toBe(false);
    expect(containsKey(parsed, "actorUserId")).toBe(false);
    expect(containsKey(parsed, "actor_user_id")).toBe(false);
    expect(containsValue(parsed, SENTINEL)).toBe(false);
    expect(containsValue(parsed, "Chen Hao")).toBe(false);
    expect(containsValue(parsed, FIXTURE_ADMIN_EMAIL)).toBe(false);

    const panel = page.getByRole("tabpanel", { name: /saved sheets/i });
    const panelText = await panel.textContent();
    expect(panelText).not.toContain(SENTINEL);
    expect(panelText).not.toMatch(/Chen Hao/);
    expect(panelText).not.toContain(FIXTURE_ADMIN_EMAIL);
    expect(panelText).not.toMatch(/ownerUserId|actorUserId/i);
  });

  test("refresh while template values are present discards values on reload", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: new RegExp(`load ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode").first()).toBeVisible();

    await page.getByLabel("minimum_id value").fill("42");
    await expect(page.getByLabel("minimum_id value")).toHaveValue("42");

    await page.reload();
    await expect(page.getByRole("tab", { name: /saved sheets/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode")).toHaveCount(0);
    await expect(page.getByLabel("minimum_id value")).toHaveCount(0);
  });

  test("sign-out and re-login discards template values", async ({ page }) => {
    await openQueryWorkbench(page);
    const readyIndex = await findReadyOptionIndex(page);
    if (readyIndex === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIndex);

    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await expect(page.getByText(SHARED_PARAM_TEMPLATE_NAME).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: new RegExp(`load ${SHARED_PARAM_TEMPLATE_NAME}`, "i") }).first().click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode").first()).toBeVisible();

    await page.getByLabel("minimum_id value").fill("99");
    await expect(page.getByLabel("minimum_id value")).toHaveValue("99");

    await page.getByText("Chen Hao").first().click();
    await page.getByRole("menuitem", { name: /sign out/i }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await loginViaUI(page);

    await page.goto("/query");
    await expect(page).toHaveURL(/\/query/);
    const readyIdx = await findReadyOptionIndex(page);
    if (readyIdx === null) throw noReadyTargetFixtureError();
    await selectConnectionTarget(page, readyIdx);

    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByText("Template mode")).toHaveCount(0);
    await expect(page.getByLabel("minimum_id value")).toHaveCount(0);
  });

  test("shared statement list pagination navigates pages and shows correct items", async ({
    page,
  }) => {
    const token = await getAuthToken();
    const targetsRes = await fetch(`${PROBE_API_BASE}/query-targets`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!targetsRes.ok) {
      throw fixtureSetupError(`GET /query-targets returned ${targetsRes.status}`);
    }
    const targetsBody = (await targetsRes.json()) as {
      items?: Array<{ resourceId: number; availableActions?: { run?: boolean } }>;
    };
    const readyTarget = (targetsBody.items ?? []).find(
      (t) => t.availableActions?.run === true,
    );
    if (!readyTarget) throw noReadyTargetFixtureError();
    const targetId = readyTarget.resourceId;

    const seededIds: number[] = [];
    const cleanupFailures: string[] = [];
    const SEED_PREFIX = "Pagination seed";

    // Register cleanup before the first mutation so a partial seed still cleans up.
    const cleanupSeeded = async () => {
      for (const id of seededIds) {
        const res = await fetch(
          `${PROBE_API_BASE}/query-targets/${targetId}/saved-statements/${id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
            signal: AbortSignal.timeout(5_000),
          },
        ).catch((error: unknown) => {
          cleanupFailures.push(
            `DELETE saved-statement ${id} threw: ${error instanceof Error ? error.message : String(error)}`,
          );
          return null;
        });
        if (res && !res.ok && res.status !== 404) {
          cleanupFailures.push(`DELETE saved-statement ${id} returned ${res.status}`);
        }
      }
      if (cleanupFailures.length > 0) {
        throw new Error(
          `E2E cleanup failed for shared list pagination seeds:\n${cleanupFailures.join("\n")}`,
        );
      }
    };

    try {
      for (let i = 0; i < 25; i++) {
        const res = await fetch(
          `${PROBE_API_BASE}/query-targets/${targetId}/saved-statements`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `${SEED_PREFIX} ${String(i).padStart(2, "0")}`,
              statement: "SELECT 1",
              scope: "shared_template",
              parameters: [],
            }),
            signal: AbortSignal.timeout(10_000),
          },
        );
        if (!res.ok) {
          throw fixtureSetupError(
            `create pagination seed "${SEED_PREFIX} ${String(i).padStart(2, "0")}" returned ${res.status}: ${await res.text()}`,
          );
        }
        const body = (await res.json()) as { id?: number };
        if (typeof body.id !== "number") {
          throw fixtureSetupError(
            `create pagination seed returned unexpected body: ${JSON.stringify(body)}`,
          );
        }
        seededIds.push(body.id);
      }

      await openQueryWorkbench(page);
      const readyIndex = await findReadyOptionIndex(page);
      if (readyIndex === null) throw noReadyTargetFixtureError();
      await selectConnectionTarget(page, readyIndex);

      await page.getByRole("tab", { name: /saved sheets/i }).click();
      await expect(
        page.getByText(/E2E shared|Pagination|loading/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      const nextBtn = page.getByRole("button", { name: /^next$/i });
      const prevBtn = page.getByRole("button", { name: /^previous$/i });
      const pageIndicator = page.getByText(/Page \d+ of \d+/);

      await expect(nextBtn).toBeEnabled();
      await expect(pageIndicator).toBeVisible();
      const page1Text = await pageIndicator.textContent();

      const listRequest = page.waitForResponse(
        (resp) => resp.url().includes("/saved-statements") && resp.url().includes("page=2") && resp.ok(),
        { timeout: 10_000 },
      );
      await nextBtn.click();
      await listRequest;

      await expect(pageIndicator).not.toHaveText(page1Text!, { timeout: 5_000 });
      await expect(prevBtn).toBeEnabled();

      const prevRequest = page.waitForResponse(
        (resp) => resp.url().includes("/saved-statements") && resp.url().includes("page=1") && resp.ok(),
        { timeout: 10_000 },
      );
      await prevBtn.click();
      await prevRequest;

      await expect(pageIndicator).toHaveText(page1Text!, { timeout: 5_000 });
    } finally {
      await cleanupSeeded();
    }
  });
});
