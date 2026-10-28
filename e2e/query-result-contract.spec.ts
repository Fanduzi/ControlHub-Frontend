// input: @playwright/test, csv-parse/sync, ./harness/*, ./api.helpers, real backend/frontend at localhost
// output: T13-A real-browser acceptance — three governed result routes declare
//   capabilities:["cellTruncated"], real backend truncation matrices render
//   per-cell badges, CSV refuses truncated pages, 409 upgrade-required shows
//   controlled copy without retry, and response fault injection fails closed
// pos: real-backend result-contract E2E; fault injection (capability strip /
//   matrix corruption) is labeled per-test and never claimed as normal server
//   behavior; the fixture-target export affordance flag is flipped in
//   e2e/api-proxy.mjs because the backend keeps availableActions.export=false
//   for every target today
// note: if this file changes, update header and e2e/README.md
import { expect, test, type Page, type Request as PlaywrightRequest } from "@playwright/test";
import { parse } from "csv-parse/sync";

import { checkBackendHealth } from "./harness/backend-health";
import { getAuthToken, apiFetch } from "./api.helpers";
import {
  ensureResultContractFixture,
  T13_CELLS,
} from "./harness/result-contract-fixture";
import {
  installSavedStatementTeardown,
  submitSavedStatementCreate,
} from "./harness/saved-statement-teardown";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
  takeExpectedConsoleStatusError,
  takeExpectedNetworkError,
  type ConsoleMessage,
  type ExpectedHttpError,
} from "./harness/console-guards";
import {
  clearAndType,
  ensureReadyTargetSelected,
  openQueryWorkbench,
} from "./harness/workbench";

const FIXTURE_DIAGNOSTIC =
  "Run: make query-e2e-mysql-up && seed-query-dev-target";

const PROBE_API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

let readyTargetDisplayName: string | null = null;
let readyTargetResourceId: number | null = null;
let fixtureAdminToken: string | null = null;

test.beforeAll(async () => {
  await checkBackendHealth();

  const token = await getAuthToken();
  fixtureAdminToken = token;

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
      displayName?: string;
      availableActions?: { run?: boolean };
    }>;
  };
  const readyTarget = (targetsBody.items ?? []).find(
    (t) => t.availableActions?.run === true && t.displayName,
  );
  if (!readyTarget?.displayName) {
    throw new Error(
      `Fixture readiness probe failed: no runnable query target. ${FIXTURE_DIAGNOSTIC}`,
    );
  }
  readyTargetDisplayName = readyTarget.displayName;
  readyTargetResourceId = readyTarget.resourceId;

  // Seed boundary cells, nav FK tables, and their disclosure policies.
  await ensureResultContractFixture(token, readyTarget.resourceId);
});

test.beforeEach(async () => {
  if (fixtureAdminToken === null) throw new Error("E2E fixture admin token is unavailable");
  const token = fixtureAdminToken;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const workspace = await apiFetch<{ worksheets: unknown[]; version: number }>(
      "/query-workspace",
      { token },
    );
    if (workspace.worksheets.length === 0) return;
    try {
      await apiFetch("/query-workspace", {
        method: "PUT",
        token,
        body: JSON.stringify({ expectedVersion: workspace.version, worksheets: [] }),
      });
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("query_workspace_conflict") || attempt === 4) {
        throw err;
      }
    }
  }
});

type ConsumableHttpExpectation = ExpectedHttpError & {
  consumeConsoleStatusEcho?: boolean;
};

/** Keys that must never appear in a governed execution request body. */
const FORBIDDEN_BODY_KEYS = new Set([
  "actor",
  "actorUserId",
  "actoruserid",
  "role",
  "credential",
  "credentialref",
  "dsn",
  "password",
  "secret",
  "username",
  "email",
  "token",
]);

function assertResultContractBody(body: Record<string, unknown>): void {
  expect(body.capabilities).toEqual(["cellTruncated"]);
  for (const key of Object.keys(body)) {
    expect(
      FORBIDDEN_BODY_KEYS.has(key.toLowerCase()),
      `forbidden request-body key "${key}"`,
    ).toBe(false);
  }
}

async function openReady(page: Page): Promise<void> {
  await openQueryWorkbench(page);
  if (readyTargetDisplayName === null || readyTargetResourceId === null) {
    throw new Error(`ready fixture target unresolved. ${FIXTURE_DIAGNOSTIC}`);
  }
  await ensureReadyTargetSelected(
    page,
    readyTargetDisplayName,
    readyTargetResourceId,
  );
}

async function runSql(page: Page, sql: string): Promise<PlaywrightRequest> {
  await clearAndType(page, sql);
  const request = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname),
  );
  await page.getByRole("button", { name: /^(run|执行)$/i }).click();
  const req = await request;
  await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
  return req;
}

/** Grid row containing a cell whose entire text equals `marker`. */
function rowWithNote(page: Page, marker: string) {
  return page
    .getByRole("row")
    .filter({ has: page.getByRole("gridcell", { name: marker, exact: true }) });
}

test.describe("T13-A result contract consumption", () => {
  installSavedStatementTeardown();

  let consoleMessages: ConsoleMessage[];
  let networkErrors: string[];
  let consumableHttpErrors: ConsumableHttpExpectation[];

  test.beforeEach(async ({ page }) => {
    consumableHttpErrors = [];
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
      await page.screenshot({
        path: `query-contract-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`,
        fullPage: true,
      });
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

  test("execute declares cellTruncated and renders positional badges on real truncated cells", async ({
    page,
  }) => {
    await openReady(page);

    const request = await runSql(
      page,
      `select id, pad, note from query_e2e_aux.t13_cells where id in (1,2,3,4,5) order by id`,
    );
    const body = request.postDataJSON() as Record<string, unknown>;
    assertResultContractBody(body);
    expect(typeof body.statement).toBe("string");

    // Page-level notice once any delivered cell is flagged.
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();

    // Positional assertions: badges live on the truncated pad cells only.
    const edgeRow = rowWithNote(page, "edge-8192");
    await expect(edgeRow.getByTestId("cell-truncated-badge")).toHaveCount(0);
    // edge-8192 pad is exactly 8192 bytes — backend must NOT flag it.
    const edgePad = edgeRow.getByRole("gridcell").nth(1);
    expect(await edgePad.textContent()).toHaveLength(8192);

    for (const marker of ["over-8193", "cjk-cross", "emoji-cross"]) {
      const row = rowWithNote(page, marker);
      await expect(row.getByTestId("cell-truncated-badge")).toHaveCount(1);
    }
    // over-8193 pad arrives as the exact 8192-byte 'b' prefix, unmodified.
    const overPad = rowWithNote(page, "over-8193")
      .getByRole("gridcell")
      .nth(1);
    const overText = await overPad.textContent();
    expect(overText).toMatch(/^b{8}/);
    expect(overText?.replace(/[^b]/g, "").length).toBe(8192);
    // cjk-cross: 8193 bytes of '中' → 2730 chars (8190 bytes) valid prefix.
    const cjkPad = rowWithNote(page, "cjk-cross")
      .getByRole("gridcell")
      .nth(1);
    expect(await cjkPad.textContent()).toMatch(/^中{8}/);
    // cjk-8190 row exists in the result only via where id in (1..5)? id=5 is
    // included: 8190-byte clean CJK cell must carry no badge.
    await expect(
      rowWithNote(page, "cjk-8190").getByTestId("cell-truncated-badge"),
    ).toHaveCount(0);

    // Total badge count equals the flagged matrix cells on this page.
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(3);

    // CSV export is disabled with the reason exposed on the control.
    const exportButton = page.getByTestId("export-csv");
    await expect(exportButton).toBeDisabled();
    await expect(exportButton).toHaveAttribute("aria-label", /truncated/i);
  });

  test("truncated cell copy is blocked while clean cells stay copyable", async ({
    page,
  }) => {
    await openReady(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    await runSql(
      page,
      `select id, pad, note from query_e2e_aux.t13_cells where id in (1,2) order by id`,
    );

    // Truncated pad cell (row id=2): copy affordance disabled.
    const truncatedCell = rowWithNote(page, "over-8193")
      .getByRole("gridcell")
      .nth(1);
    await truncatedCell.click();
    const copyButton = page.getByTestId("copy-selection");
    await expect(copyButton).toBeDisabled();
    await expect(copyButton).toHaveAttribute("aria-label", /truncated/i);

    // Clean note cell on the same row: still copyable.
    const cleanCell = rowWithNote(page, "over-8193")
      .getByRole("gridcell")
      .nth(2);
    await cleanCell.click();
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    await expect
      .poll(() =>
        page.evaluate(() => navigator.clipboard.readText()),
      )
      .toBe("over-8193");
  });

  test("clean page downloads a parseable CSV with field-level fidelity", async ({
    page,
  }) => {
    await openReady(page);

    // Fully copyable projection only — `secret` is masked_no_copy and would
    // make the page ineligible under the whole-page export contract.
    await runSql(
      page,
      `select id, pad, note from query_e2e_aux.t13_cells where id in (6,7,8,9,10) order by id`,
    );

    await expect(page.getByTestId("truncated-page-notice")).toHaveCount(0);
    const exportButton = page.getByTestId("export-csv");
    await expect(exportButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await exportButton.click();
    const download = await downloadPromise;
    const path = await download.path();
    if (!path) throw new Error("download produced no file path");

    const fs = await import("node:fs/promises");
    const csvText = await fs.readFile(path, "utf8");
    // Field-level round-trip through an independent RFC-4180 reader.
    const records = parse(csvText, { relax_quotes: false }) as string[][];

    expect(records[0]).toEqual(["id", "pad", "note"]);
    const rowFor = (id: string) =>
      records.find((r) => r[0] === id && r.length === 3);
    // NULL → empty field; '' → empty field; text 'NULL' preserved verbatim.
    expect(rowFor(String(T13_CELLS.emptyStr))).toEqual(["6", "", "empty-str"]);
    expect(rowFor(String(T13_CELLS.sqlNull))).toEqual(["7", "", "sql-null"]);
    expect(rowFor(String(T13_CELLS.textNull))).toEqual(["8", "NULL", "text-null"]);
    // Comma+quote and embedded newline round-trip through field-level parsing.
    expect(rowFor(String(T13_CELLS.csvCommaQuote))?.[2]).toBe('x,"y');
    expect(rowFor(String(T13_CELLS.csvNewline))?.[2]).toBe("line1\nline2");
  });

  test("a page with a masked column produces zero download events", async ({
    page,
  }) => {
    await openReady(page);

    // The masked `secret` column is deliverable to the grid, but the page is
    // never exportable: the whole-page contract refuses any non-copyable
    // column, so the control disables and no download event can occur.
    await runSql(
      page,
      `select id, pad, secret, note from query_e2e_aux.t13_cells where id in (6,7,8) order by id`,
    );
    await expect(page.getByRole("grid")).toBeVisible();

    const downloadEvents: string[] = [];
    page.on("download", (d) => downloadEvents.push(d.suggestedFilename()));
    const exportButton = page.getByTestId("export-csv");
    await expect(exportButton).toBeDisabled();
    await exportButton.click({ force: true });
    await page.waitForTimeout(500);
    expect(downloadEvents).toHaveLength(0);
  });

  test("projecting an unpolicied column is refused 403 — capabilities cannot export it", async ({
    page,
  }) => {
    await openReady(page);

    // `free` deliberately has no disclosure policy: the real backend refuses
    // the whole query before any row leaves — the strongest proof that a
    // blocked column can never reach CSV through the capability declaration.
    await clearAndType(
      page,
      "select id, free from query_e2e_aux.t13_cells where id = 1",
    );
    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    const response = page.waitForResponse(
      (resp) =>
        resp.request().method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(resp.url()).pathname),
    );
    await page.getByRole("button", { name: /^(run|执行)$/i }).click();
    const [req, resp] = await Promise.all([request, response]);
    assertResultContractBody(req.postDataJSON() as Record<string, unknown>);
    expect(resp.status()).toBe(403);
    consumableHttpErrors.push({
      method: "POST",
      url: req.url(),
      status: 403,
      consumeConsoleStatusEcho: true,
    });

    const alert = page
      .getByTestId("query-workbench-grid")
      .getByRole("alert");
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(page.getByTestId("export-csv")).toHaveCount(0);
  });

  test("truncated page produces no download; pagination to a clean page re-enables export", async ({
    page,
  }) => {
    await openReady(page);

    await runSql(
      page,
      `select id, pad, note from query_e2e_aux.t13_cells order by id`,
    );

    // Page 1 (ids 1-10) contains truncated cells → no download possible.
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();
    const exportButton = page.getByTestId("export-csv");
    await expect(exportButton).toBeDisabled();
    const downloadEvents: string[] = [];
    page.on("download", (d) => downloadEvents.push(d.suggestedFilename()));
    // Watch briefly: the disabled control and the in-handler matrix guard must
    // both refuse to produce a download (unit tests cover the serializer gate).
    await page.waitForTimeout(500);
    expect(downloadEvents).toHaveLength(0);

    // Page 2 (ids 11-15) is clean → export re-enabled. The page-1 matrix must
    // not leak into the page-2 result.
    await page.getByRole("button", { name: /next page/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("truncated-page-notice")).toHaveCount(0);
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(0);
    await expect(page.getByTestId("export-csv")).toBeEnabled();
  });

  test("saved-statement execute declares capability and renders a truncated badge", async ({
    page,
  }) => {
    await openReady(page);

    // Create a parameterized saved statement through the real UI.
    const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const name = `T13 trunc ${suffix}`;
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    await page
      .locator('[aria-label*="Save current statement as personal"]')
      .click();
    const saveDialog = page.getByRole("dialog", {
      name: /save as personal query|保存为个人查询/i,
    });
    await saveDialog.getByLabel(/statement name|语句名称/i).fill(name);
    await saveDialog
      .getByLabel(/SQL statement|SQL 语句/i)
      .fill(
        "select id, pad, note from query_e2e_aux.t13_cells where id = :cell_id",
      );
    await page.getByRole("button", { name: /add parameter/i }).first().click();
    const row = page.getByTestId("parameter-row-0");
    await row.locator("input").fill("cell_id");
    await row.getByLabel(/type/i).selectOption("integer");
    await submitSavedStatementCreate(page, () =>
      page.getByRole("button", { name: /^create$/i }).first().click(),
    );
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 10_000 });

    // Load it into a worksheet (template mode) and run with the truncated row.
    await page
      .getByRole("button", { name: new RegExp(`load ${name}`, "i") })
      .first()
      .click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();
    await expect(page.getByLabel("cell_id value")).toBeVisible({
      timeout: 10_000,
    });
    await page.getByLabel("cell_id value").fill("2");

    const request = page.waitForRequest(
      (req) =>
        req.method() === "POST" &&
        /\/saved-statements\/\d+\/execute$/.test(new URL(req.url()).pathname),
    );
    await page.getByRole("button", { name: /^(run|执行)$/i }).click();
    const req = await request;
    const body = req.postDataJSON() as Record<string, unknown>;
    assertResultContractBody(body);
    expect(body.values).toEqual({ cell_id: 2 });
    // The saved statement body never re-sends SQL text or parameter defs.
    expect(body.statement).toBeUndefined();
    expect(body.parameters).toBeUndefined();

    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(1);
    await expect(page.getByTestId("export-csv")).toBeDisabled();
  });

  test("related-records declares capability and truncated parent pad reaches the panel", async ({
    page,
  }) => {
    await openReady(page);

    // Preview t13_child (FK → t13_parent), run, select a child row cell.
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    const auxDb = explorer.getByRole("treeitem", { name: "query_e2e_aux" });
    await expect(auxDb).toBeVisible({ timeout: 15_000 });
    await auxDb.click();
    // The aux schema has 26+ objects; search narrows the tree to t13_child.
    const searchInput = explorer.getByRole("textbox", {
      name: /search objects in query_e2e_aux/i,
    });
    await searchInput.fill("t13_child");
    const childTable = explorer.getByRole("treeitem", { name: "t13_child" });
    await expect(childTable).toBeVisible({ timeout: 10_000 });
    await childTable.click();
    await explorer.getByRole("button", { name: "Preview data" }).click();
    await page.getByRole("button", { name: /^(run|执行)$/i }).click();
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 15_000 });

    // Child row 1 points at parent 1 (9000-byte pad → truncated).
    const firstRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: "t13c1", exact: true }) });
    await firstRow.getByRole("gridcell").first().click();

    const relatedRequest = page.waitForRequest(
      (req) =>
        req.url().includes("/related-records") && req.method() === "POST",
    );
    await page.getByTestId("related-records").click();
    await page
      .getByRole("menuitem", { name: /fk_t13_child_parent/ })
      .click();
    const request = await relatedRequest;
    const body = request.postDataJSON() as Record<string, unknown>;
    assertResultContractBody(body);
    // localValues carries the child's FK column values — allowed field.
    expect(Array.isArray(body.localValues)).toBe(true);
    expect(body.statement).toBeUndefined();

    const relatedPanel = page.getByRole("region", { name: "Related records" });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });
    await expect(relatedPanel.getByRole("grid")).toBeVisible({ timeout: 10_000 });

    // The referenced parent row's oversized pad is delivered as a truncated
    // prefix with a badge — through the navigation path, not plain execute.
    await expect(relatedPanel.getByText("T13_P1")).toBeVisible();
    await expect(
      relatedPanel.getByTestId("cell-truncated-badge"),
    ).toHaveCount(1);
    const padCell = relatedPanel
      .getByRole("row")
      .filter({ has: page.getByRole("gridcell", { name: "T13_P1", exact: true }) })
      .getByRole("gridcell")
      .nth(2);
    const padText = await padCell.textContent();
    expect(padText).toMatch(/^w{8}/);
    expect(padText?.replace(/[^w]/g, "").length).toBe(8192);
  });

  test("409 result_contract_upgrade_required shows controlled copy, no retry, no stale result", async ({
    page,
  }) => {
    await openReady(page);

    const sql = `select id, pad, note from query_e2e_aux.t13_cells where id = 2`;

    // First run WITH capabilities: truncated result renders normally.
    await runSql(page, sql);
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();

    // FAILURE INJECTION: strip `capabilities` from the browser request so the
    // real backend capability gate produces 409 result_contract_upgrade_required.
    // The backend truly evaluates and rejects — no response is fabricated here.
    let executeCount = 0;
    let executeUrl = "";
    await page.route("**/query-targets/*/execute", async (route) => {
      const req = route.request();
      executeCount += 1;
      executeUrl = req.url();
      const original = req.postDataJSON() as Record<string, unknown>;
      const strippedBody = { ...original };
      delete strippedBody.capabilities;
      const upstream = await route.fetch({ postData: JSON.stringify(strippedBody) });
      await route.fulfill({ response: upstream });
    });

    try {
      await page.getByRole("button", { name: /^(run|执行)$/i }).click();

      const alert = page
        .getByTestId("query-workbench-grid")
        .getByRole("alert");
      await expect(alert).toBeVisible({ timeout: 15_000 });
      consumableHttpErrors.push({
        method: "POST",
        url: executeUrl,
        status: 409,
        consumeConsoleStatusEcho: true,
      });

      // Controlled localized copy — the query ran but delivery was refused.
      await expect(alert).toContainText(
        "results were not delivered because this client lacks the required result contract",
      );
      // No retry affordance for a non-retryable controlled code.
      await expect(alert.getByRole("button", { name: /retry/i })).toHaveCount(0);
      // Stale result is cleared: grid, badges, and export are gone.
      await expect(page.getByRole("grid")).toHaveCount(0);
      await expect(page.getByTestId("export-csv")).toHaveCount(0);
      await expect(page.getByTestId("truncated-page-notice")).toHaveCount(0);
      // Exactly one request went out for this run — no automatic retry.
      expect(executeCount).toBe(1);
    } finally {
      await page.unroute("**/query-targets/*/execute");
    }
  });

  test("corrupted matrix fault injection fails closed instead of rendering", async ({
    page,
  }) => {
    await openReady(page);

    // FAULT INJECTION: fabricate a well-formed execute envelope whose matrix
    // is one cell short. The backend never emits this; the point is proving
    // normalizeExecuteResponse fails closed instead of rendering unchecked
    // rows. No real response is mutated — the whole body is synthetic.
    await page.route("**/query-targets/*/execute", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        json: {
          executionId: "fault-injection-exec",
          columns: [
            { name: "id", displayMode: "raw_copy_allowed", copyAllowed: true },
            { name: "note", displayMode: "raw_copy_allowed", copyAllowed: true },
          ],
          rows: [[1, "edge-8192"]],
          rowCount: 1,
          cellTruncated: [[false]],
          truncated: false,
          durationMs: 1,
          limitApplied: 100,
          executedAt: "2026-10-10T00:00:00Z",
        },
      });
    });

    try {
      await clearAndType(
        page,
        "select id, pad, note from query_e2e_aux.t13_cells where id = 1",
      );
      await page.getByRole("button", { name: /^(run|执行)$/i }).click();

      // Malformed matrix must never reach a copyable/exportable result state.
      const alert = page
        .getByTestId("query-workbench-grid")
        .getByRole("alert");
      await expect(alert).toBeVisible({ timeout: 15_000 });
      await expect(page.getByRole("grid")).toHaveCount(0);
      await expect(page.getByTestId("export-csv")).toHaveCount(0);
    } finally {
      await page.unroute("**/query-targets/*/execute");
    }
  });

  test("two worksheets keep truncated and clean result states isolated", async ({
    page,
  }) => {
    await openReady(page);

    // Worksheet 1: truncated page.
    await runSql(
      page,
      "select id, pad, note from query_e2e_aux.t13_cells where id = 2",
    );
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(1);
    await expect(page.getByTestId("export-csv")).toBeDisabled();
    const ws1Tab = page
      .locator('[role="tab"][aria-selected="true"]')
      .first();
    const ws1Name = await ws1Tab.textContent();

    // Worksheet 2: clean page.
    await page.getByRole("button", { name: /add worksheet/i }).click();
    await runSql(
      page,
      "select id, pad, note from query_e2e_aux.t13_cells where id = 1",
    );
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(0);
    await expect(page.getByTestId("export-csv")).toBeEnabled();

    // Back on worksheet 1, the truncated state and disabled export persist —
    // the clean worksheet's matrix never leaks across.
    await page
      .getByRole("tab", { name: ws1Name!, exact: true })
      .click();
    await expect(page.getByTestId("cell-truncated-badge")).toHaveCount(1);
    await expect(page.getByTestId("export-csv")).toBeDisabled();
  });
});
