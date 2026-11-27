import { expect, test, type Page, type Request as PlaywrightRequest } from "@playwright/test";
import { parse } from "csv-parse/sync";
import type { QueryExecuteResponse } from "../types/query-execution";

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
    await page.getByRole("button", { name: "Visible columns" }).click();
    await page.getByRole("checkbox", { name: "note" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("columnheader", { name: "note" })).toHaveCount(0);

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
    expect(rowFor(String(T13_CELLS.csvCommaQuote))?.[2]).toBe('x|,"y');
    expect(rowFor(String(T13_CELLS.csvNewline))?.[2]).toBe("line1\nline2");
  });

  test("downloads only the current page as JSON without changing delivered values", async ({
    page,
  }) => {
    await openReady(page);

    let executeRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname)
      ) {
        executeRequests += 1;
      }
    });

    // Default page of 10 under `id desc`: ids 15→6 are clean; page 2 (ids
    // 5→1) carries the oversized pads, so only page 1 may serialize.
    await runSql(
      page,
      `select id, pad, note from query_e2e_aux.t13_cells order by id desc`,
    );

    await expect(
      page.getByRole("button", { name: /next page/i }),
    ).toBeEnabled();
    const exportButton = page.getByTestId("export-json");
    await expect(exportButton).toBeEnabled();

    // The display-only view may reorder and hide rows, but the download must
    // still serialize the delivered page — ids 15→6, all ten rows.
    await page
      .getByRole("button", { name: "Sort id ascending", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "Filter column" })
      .selectOption({ label: "note" });
    await page.getByRole("textbox", { name: "Contains text" }).fill("p2");
    const contractGrid = page.getByRole("grid");
    await expect(contractGrid.locator("tbody tr")).toHaveCount(5);
    await expect(
      contractGrid.locator("tbody tr").first().getByRole("gridcell").first(),
    ).toHaveText("11");

    // Keyboard-hide pad; the download still contains that delivered column.
    const columnMenu = page.getByRole("button", { name: "Visible columns" });
    const pad = page.getByRole("checkbox", { name: "pad" });
    await columnMenu.focus();
    await page.keyboard.press("Enter");
    await pad.focus();
    await page.keyboard.press("Space");
    await expect(pad).not.toBeChecked();
    await page.keyboard.press("Escape");
    await expect(columnMenu).toBeFocused();
    await expect(contractGrid.getByRole("columnheader", { name: "pad" })).toHaveCount(0);
    const firstCell = contractGrid.locator("tbody tr").first().getByRole("gridcell").first();
    await firstCell.click();
    await page.keyboard.press("ArrowRight");
    await expect(contractGrid.getByRole("gridcell", { name: "p2", exact: true }).first()).toBeFocused();

    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await exportButton.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("query-results.json");
    const path = await download.path();
    if (!path) throw new Error("download produced no file path");

    const fs = await import("node:fs/promises");
    const payload = JSON.parse(await fs.readFile(path, "utf8")) as {
      columns: string[];
      rows: (string | number | boolean | null)[][];
    };
    expect(payload).toEqual({
      columns: ["id", "pad", "note"],
      rows: [
        ["15", "page2-e", "p2"],
        ["14", "page2-d", "p2"],
        ["13", "page2-c", "p2"],
        ["12", "page2-b", "p2"],
        ["11", '{"orderNo":9007199254740993,"status":"open"}', "p2"],
        ["10", "plain2", "line1\nline2"],
        ["9", "plain", 'x|,"y'],
        ["8", "NULL", "text-null"],
        ["7", null, "sql-null"],
        ["6", "", "empty-str"],
      ],
    });

    // The download is a local serialization: exactly one execute happened.
    expect(executeRequests).toBe(1);

    // Page 2 contains truncated cells — the shared whole-page gate disables
    // JSON export exactly like CSV. Paging is the second (and last) execute.
    await page.getByRole("button", { name: /next page/i }).click();
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("export-json")).toBeDisabled();
    await expect(contractGrid.getByRole("columnheader", { name: "pad" })).toBeVisible();
    await columnMenu.click();
    await pad.click();
    await page.keyboard.press("Escape");
    await expect(contractGrid.getByTestId("cell-truncated-badge")).toHaveCount(0);
    await expect(page.getByTestId("export-json")).toBeDisabled();
    await expect(page.getByTestId("export-csv")).toBeDisabled();
    expect(executeRequests).toBe(2);
  });

  test("freezes a visible column through wide scrolling, resize, and column search", async ({ page }) => {
    await openReady(page);
    await page.setViewportSize({ width: 375, height: 900 });
    let executes = 0;
    page.on("request", (req) => {
      if (req.method() === "POST" && /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname)) executes++;
    });
    await runSql(page, "select id, pad, note from query_e2e_aux.t13_cells order by id desc");
    const grid = page.getByRole("grid");
    const header = (name: string) => grid.getByRole("columnheader", { name, exact: true });
    const freeze = page.getByRole("button", { name: "Freeze first visible column" });
    await expect(freeze).toHaveAttribute("aria-pressed", "false");
    await header("id").focus();
    for (let i = 0; i < 24; i++) await page.keyboard.press("Shift+ArrowRight");
    await expect(header("id")).toHaveAttribute("aria-description", "Width: 544px");
    await freeze.click();
    await expect(freeze).toHaveAttribute("aria-pressed", "true");
    const scrollport = grid.locator("..");
    const widths = async () => grid.evaluate((table) => ({
      port: table.parentElement!.clientWidth,
      frozen: table.querySelector("th[data-frozen-column]")!.getBoundingClientRect().width,
    }));
    await expect.poll(async () => { const w = await widths(); return w.port - w.frozen; }).toBeGreaterThanOrEqual(103);
    await expect.poll(async () => { const w = await widths(); return w.frozen; }).toBeLessThan(544);
    const idBefore = (await header("id").boundingBox())!.x;
    const noteBefore = (await header("note").boundingBox())!.x;
    await scrollport.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(async () => (await header("note").boundingBox())!.x).toBeLessThan(noteBefore - 30);
    expect(Math.abs((await header("id").boundingBox())!.x - idBefore)).toBeLessThan(2);
    await header("id").focus();
    await page.keyboard.press("ArrowRight");
    await expect(header("pad")).toBeFocused();
    await expect.poll(async () => {
      const pad = (await header("pad").boundingBox())!;
      const id = (await header("id").boundingBox())!;
      return pad.x + pad.width - (id.x + id.width);
    }).toBeGreaterThan(60);

    await page.getByRole("button", { name: "Visible columns" }).click();
    const search = page.getByRole("searchbox", { name: "Search columns" });
    await expect(search).toBeFocused();
    await search.fill("ID");
    await expect(page.getByRole("checkbox", { name: "pad" })).toHaveCount(0);
    await expect(header("pad")).toBeAttached();
    await page.keyboard.press("Tab");
    const idCheckbox = page.getByRole("checkbox", { name: "id" });
    await expect(idCheckbox).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await expect(header("id")).toHaveCount(0);
    await expect(header("pad")).toHaveAttribute("data-frozen-column", "");
    await header("pad").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(header("pad")).toHaveAttribute("aria-description", "Width: 176px");
    await page.setViewportSize({ width: 200, height: 900 });
    await expect.poll(async () => (await widths()).port).toBeLessThan(208);
    await expect(header("pad")).toHaveAttribute("aria-description", "Width: 104px");
    expect((await widths()).frozen).toBeGreaterThanOrEqual(103);
    await page.setViewportSize({ width: 375, height: 900 });
    expect(executes).toBe(1);

    await page.getByRole("button", { name: /next page/i }).click();
    await expect(header("id")).toBeVisible();
    await expect(freeze).toHaveAttribute("aria-pressed", "false");
    await freeze.click();
    await expect(header("id")).toHaveAttribute("data-frozen-column", "");
    await runSql(page, "select id, pad, note from query_e2e_aux.t13_cells order by id desc");
    await expect(freeze).toHaveAttribute("aria-pressed", "false");
    expect(executes).toBe(3);
  });

  test("keeps the lead column visible on a real twelve-column order result at desktop width", async ({ page }) => {
    await openReady(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await runSql(page, "select * from query_e2e_aux.t13_wide_orders order by id desc");
    const grid = page.getByRole("grid");
    const header = (name: string) => grid.getByRole("columnheader", { name, exact: true });
    const port = grid.locator("..");
    const frozen = page.getByRole("button", { name: "Freeze first visible column" });
    await expect(grid.getByRole("columnheader")).toHaveCount(12);
    await expect(grid.getByRole("gridcell", { name: "order-15" })).toHaveCount(1);
    await expect(header("id")).toHaveAttribute("aria-description", "Width: 160px");
    expect(await port.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(200);
    await expect(frozen).toHaveAttribute("aria-pressed", "false");
    await frozen.click();
    const leadX = (await header("id").boundingBox())!.x;
    const tailX = (await header("note").boundingBox())!.x;
    await port.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect.poll(async () => (await header("note").boundingBox())!.x).toBeLessThan(tailX - 200);
    expect(Math.abs((await header("id").boundingBox())!.x - leadX)).toBeLessThan(2);

    await header("id").focus();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(header("id")).toHaveAttribute("aria-description", "Width: 176px");
    await page.keyboard.press("ArrowRight");
    await expect(header("status")).toBeFocused();
    const statusBox = (await header("status").boundingBox())!;
    expect(statusBox.x + statusBox.width).toBeGreaterThan(leadX + 200);

    await page.getByRole("button", { name: "Visible columns" }).click();
    await page.getByRole("searchbox", { name: "Search columns" }).fill("ID");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("checkbox", { name: "id", exact: true })).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await expect(grid.getByRole("columnheader")).toHaveCount(11);
    await expect(header("status")).toHaveAttribute("data-frozen-column", "");
    const nextLeadX = (await header("status").boundingBox())!.x;
    await port.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    expect(await port.evaluate((el) => el.scrollLeft)).toBeGreaterThan(200);
    expect(Math.abs((await header("status").boundingBox())!.x - nextLeadX)).toBeLessThan(2);
    await header("status").focus();
    await page.keyboard.press("ArrowRight");
    await expect(header("customer")).toBeFocused();
  });

  test("MySQL current-page view preserves row disclosure and paging", async ({
    page,
  }) => {
    await openReady(page);
    await page.setViewportSize({ width: 375, height: 900 });

    let executeRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname)
      ) {
        executeRequests += 1;
      }
    });

    await runSql(
      page,
      "select id, pad, note from query_e2e_aux.t13_cells order by id",
    );
    const grid = page.getByRole("grid");
    await expect(
      grid.locator("tbody tr").first().getByRole("gridcell").first(),
    ).toHaveText("1");

    // Display-only sort: descending puts id 10 on top, pinned on the header.
    await page
      .getByRole("button", { name: "Sort id ascending", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Sort id descending", exact: true })
      .click();
    await expect(
      grid.locator("tbody tr").first().getByRole("gridcell").first(),
    ).toHaveText("10");
    await expect(
      grid.getByRole("columnheader", { name: "id", exact: true }),
    ).toHaveAttribute("aria-sort", "descending");
    await expect(
      page.getByRole("combobox", { name: "Filter column" }),
    ).toBeVisible();
    // At 375px the document itself must not scroll sideways — the grid
    // container owns its own horizontal scroll region.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(375);

    // The moved truncated row keeps its badge and its copy refusal.
    const overRow = rowWithNote(page, "over-8193");
    const overPad = overRow.getByRole("gridcell").nth(1);
    await expect(overPad.getByTestId("cell-truncated-badge")).toBeVisible();
    await overPad.click();
    await expect(page.getByTestId("copy-selection")).toBeDisabled();

    // "bbb" exists only inside the truncated pad prefix — a truncated cell is
    // never a filter match, so the page empties and the selection clears.
    await page
      .getByRole("combobox", { name: "Filter column" })
      .selectOption({ label: "pad" });
    await page.getByRole("textbox", { name: "Contains text" }).fill("bbb");
    await expect(grid.locator("tbody tr")).toHaveCount(0);
    await expect(
      page.getByText("No matching rows on this page."),
    ).toBeVisible();
    await expect(page.getByTestId("copy-selection")).toBeDisabled();

    // Case-insensitive match on a clean column. The truncation notice and the
    // export gate still evaluate the *delivered* page — hiding every truncated
    // row in the view must not re-enable a download.
    await page
      .getByRole("combobox", { name: "Filter column" })
      .selectOption({ label: "note" });
    await page
      .getByRole("textbox", { name: "Contains text" })
      .fill("EDGE-8192");
    await expect(grid.locator("tbody tr")).toHaveCount(1);
    await expect(
      grid.locator("tbody tr").first().getByRole("gridcell").first(),
    ).toHaveText("1");
    await expect(grid.getByTestId("cell-truncated-badge")).toHaveCount(0);
    await expect(page.getByTestId("export-csv")).toBeDisabled();
    await expect(page.getByTestId("export-json")).toBeDisabled();
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();
    expect(executeRequests).toBe(1);

    // Paging eligibility is unchanged by the view: the next delivered page
    // arrives with a fresh grid (cleared filter, no sort) and clean exports.
    await expect(
      page.getByRole("button", { name: /next page/i }),
    ).toBeEnabled();
    await page.getByRole("button", { name: /next page/i }).click();
    await expect(
      grid.locator("tbody tr").first().getByRole("gridcell").first(),
    ).toHaveText("11", { timeout: 15_000 });
    await expect(
      page.getByRole("textbox", { name: "Contains text" }),
    ).toHaveValue("");
    await expect(
      grid.getByRole("columnheader", { name: "id", exact: true }),
    ).not.toHaveAttribute("aria-sort", /.*/);
    await expect(page.getByTestId("export-csv")).toBeEnabled();
    await expect(page.getByTestId("export-json")).toBeEnabled();
    expect(executeRequests).toBe(2);
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

    const menu = page.getByRole("button", { name: "Visible columns" });
    await menu.click();
    for (const name of ["secret", "pad", "note"]) {
      await page.getByRole("checkbox", { name, exact: true }).click();
    }
    await expect(page.getByRole("checkbox", { name: "id", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    const headers = page.getByRole("grid").getByRole("columnheader");
    await expect(headers).toHaveText(["id"]);
    await expect(page.getByTestId("export-csv")).toBeDisabled();
    await expect(page.getByTestId("export-json")).toBeDisabled();

    // Restore order, then hide again and rerun the same statement.
    await menu.click();
    await page.getByRole("button", { name: "Show all columns" }).click();
    await expect(headers).toHaveText(["id", "pad", "secret", "note"]);
    await menu.click();
    await page.getByRole("checkbox", { name: "secret", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(headers).toHaveText(["id", "pad", "note"]);
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(headers).toHaveText(["id", "pad", "secret", "note"]);

    const downloadEvents: string[] = [];
    page.on("download", (d) => downloadEvents.push(d.suggestedFilename()));
    for (const testId of ["export-csv", "export-json"]) {
      const exportButton = page.getByTestId(testId);
      await expect(exportButton).toBeDisabled();
      await exportButton.click({ force: true });
    }
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
    // The related-records grid never offers either export format.
    await expect(relatedPanel.getByTestId("export-json")).toHaveCount(0);
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

  for (const fault of ["missing truncation flag", "explicit copy denial on a raw column"] as const) {
    test(`Markdown copy fails closed on ${fault}`, async ({ page }) => {
      await openReady(page);
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
      const sql = "select id, note from query_e2e_aux.t13_cells where id = 1";
      await runSql(page, sql);
      const cells = page.getByRole("grid").getByRole("gridcell");
      await cells.nth(0).click();
      await cells.nth(1).click({ modifiers: ["Shift"] });
      const markdown = page.getByRole("button", { name: "Copy as Markdown" });
      await expect(markdown).toBeEnabled();
      await markdown.click();
      const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
      const cleanCopy = "| 1 | 2 |\n| --- | --- |\n| ` 1 ` | ` edge-8192 ` |";
      await expect.poll(readClipboard).toBe(cleanCopy);

      // FAULT INJECTION: the real backend cannot emit missing flags or a
      // raw_copy_allowed column with copyAllowed=false. Test each independently
      // with a synthetic envelope; the positive copy above used the real backend.
      const invalidResult: QueryExecuteResponse = {
        executionId: 123456,
        targetResourceId: readyTargetResourceId!,
        status: "success",
        engine: "mysql",
        columns: [
          { name: "id", databaseType: "BIGINT", nullable: false, displayMode: "raw_copy_allowed", copyAllowed: true },
          { name: "note", databaseType: "VARCHAR", nullable: false, displayMode: "raw_copy_allowed", copyAllowed: fault !== "explicit copy denial on a raw column" },
        ],
        rows: [[1, "unavailable-note"]],
        rowCount: 1,
        cellTruncated: [fault === "missing truncation flag" ? [false] : [false, false]],
        truncated: false,
        durationMs: 1,
        limitApplied: 100,
        executedAt: "2026-10-10T00:00:00Z",
      };
      await page.route("**/query-targets/*/execute", (route) => route.fulfill({ json: invalidResult }));

      try {
        await page.getByRole("button", { name: /^(run|执行)$/i }).click();

        // The invalid response must clear the previous copyable/exportable grid.
        const alert = page.getByTestId("query-workbench-grid").getByRole("alert");
        await expect(alert).toBeVisible({ timeout: 15_000 });
        await expect(page.getByRole("grid")).toHaveCount(0);
        await expect(markdown).toHaveCount(0);
        await expect(page.getByTestId("export-csv")).toHaveCount(0);
        await expect(page.getByTestId("export-json")).toHaveCount(0);
        await expect.poll(readClipboard).toBe(cleanCopy);
      } finally {
        await page.unroute("**/query-targets/*/execute");
      }
    });
  }

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

  test("opens only delivered JSON and long-text cell values", async ({
    page,
  }) => {
    await openReady(page);

    let executeRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname)
      ) {
        executeRequests += 1;
      }
    });

    // Grid order: id | pad | note | secret.
    // row 1: pad is the exact 8192-byte 'a' cell (delivered, not flagged);
    // row 2: pad truncated, secret masked; row 3: two-line note;
    // row 4: pad is the large-integer JSON literal.
    await runSql(
      page,
      "select id, pad, note, secret from query_e2e_aux.t13_cells where id in (1,2,10,11) order by id",
    );

    const viewButton = page.getByRole("button", {
      name: "View value",
      exact: true,
    });
    const content = page.getByTestId("result-cell-content");

    // JSON pad (row id=11): pretty print keeps the full-precision lexeme.
    await rowWithNote(page, "p2").getByRole("gridcell").nth(1).click();
    await expect(viewButton).toBeEnabled();
    await viewButton.click();
    await expect(content).toBeVisible();
    const pretty = await content.textContent();
    expect(pretty).toBe(
      `{\n  "orderNo": 9007199254740993,\n  "status": "open"\n}`,
    );
    expect(pretty).toContain("9007199254740993");

    await page
      .getByRole("button", { name: "Raw text", exact: true })
      .click();
    expect(await content.textContent()).toBe(
      `{"orderNo":9007199254740993,"status":"open"}`,
    );

    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);
    await expect(viewButton).toBeFocused();

    // The delivered 8192-byte 'a' cell opens complete — no fetch, no flag.
    await rowWithNote(page, "edge-8192")
      .getByRole("gridcell")
      .nth(1)
      .click();
    await viewButton.click();
    const longPad = await content.textContent();
    expect(longPad).toHaveLength(8192);
    expect(longPad).toMatch(/^a+$/);
    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);

    // The two-line note shows the delivered newline verbatim.
    await rowWithNote(page, "plain2")
      .getByRole("gridcell")
      .nth(2)
      .click();
    await viewButton.click();
    expect(await content.textContent()).toBe("line1\nline2");
    await page.keyboard.press("Escape");
    await expect(content).toHaveCount(0);

    // Masked secret and flagged truncated pad never open a dialog.
    await rowWithNote(page, "edge-8192")
      .getByRole("gridcell")
      .nth(3)
      .click();
    await expect(viewButton).toBeDisabled();
    await rowWithNote(page, "over-8193")
      .getByRole("gridcell")
      .nth(1)
      .click();
    await expect(viewButton).toBeDisabled();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Inspection is local: exactly one execute request for the whole test.
    expect(executeRequests).toBe(1);
  });

  test("copies a Markdown rectangle without changing TSV or copying hidden cells", async ({ page }) => {
    await openReady(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await runSql(page, "select id, pad, note, secret from query_e2e_aux.t13_cells where id in (2,6,7,9,10) order by id");
    const grid = page.getByRole("grid");
    const rows = grid.locator("tbody tr");
    const cell = (row: number, col: number) => rows.nth(row).getByRole("gridcell").nth(col);
    const markdown = page.getByRole("button", { name: "Copy as Markdown" });
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await cell(1, 1).click();
    await cell(4, 2).click({ modifiers: ["Shift"] });
    await expect(markdown).toBeEnabled();
    await markdown.click();
    await expect.poll(readClipboard).toBe('| 1 | 2 |\n| --- | --- |\n|  | ` empty-str ` |\n|  | ` sql-null ` |\n| ` plain ` | ` x\\|,"y ` |\n| ` plain2 ` | ` line1 `<br>` line2 ` |');
    await cell(4, 2).focus();
    await page.keyboard.press("ControlOrMeta+C");
    const tsv = '\tempty-str\n\tsql-null\nplain\t"x|,""y"\nplain2\t"line1\nline2"';
    await expect.poll(readClipboard).toBe(tsv);

    await cell(1, 2).click();
    await cell(1, 3).click({ modifiers: ["Shift"] });
    await expect(markdown).toBeDisabled();
    await cell(0, 1).click();
    await cell(0, 2).click({ modifiers: ["Shift"] });
    await expect(markdown).toBeDisabled();
    await page.getByRole("button", { name: "Visible columns" }).click();
    await page.getByRole("checkbox", { name: "pad", exact: true }).click();
    await page.keyboard.press("Escape");
    await cell(1, 0).click();
    await cell(1, 1).click({ modifiers: ["Shift"] });
    await expect(markdown).toBeDisabled();
    await expect.poll(readClipboard).toBe(tsv);
  });

  test("resizes a column and copies only permitted result ranges", async ({
    page,
  }) => {
    await openReady(page);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);

    let executeRequests = 0;
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        /\/query-targets\/\d+\/execute$/.test(new URL(req.url()).pathname)
      ) {
        executeRequests += 1;
      }
    });

    // Grid order: id | note | pad | secret.
    await runSql(
      page,
      `select id, note, pad, secret from query_e2e_aux.t13_cells where id in (1,2,6,7) order by id`,
    );

    const noteHeader = page.getByRole("columnheader", {
      name: "note",
      exact: true,
    });
    const padHeader = page.getByRole("columnheader", {
      name: "pad",
      exact: true,
    });
    const noteWidth = (await noteHeader.boundingBox())!.width;
    const padWidth = (await padHeader.boundingBox())!.width;

    // Pointer drag on the note column's resize handle widens only that column.
    // page.mouse does not auto-scroll like locator actions, so bring the
    // handle into the viewport before reading its box.
    const handle = noteHeader.getByTestId("result-column-resize");
    await handle.scrollIntoViewIfNeeded();
    const handleBox = (await handle.boundingBox())!;
    await page.mouse.move(
      handleBox.x + handleBox.width / 2,
      handleBox.y + handleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      handleBox.x + handleBox.width / 2 + 64,
      handleBox.y + handleBox.height / 2,
      { steps: 5 },
    );
    await page.mouse.up();

    await expect
      .poll(async () => (await noteHeader.boundingBox())!.width)
      .toBeGreaterThanOrEqual(noteWidth + 63);
    expect((await noteHeader.boundingBox())!.width).toBeLessThanOrEqual(
      noteWidth + 65,
    );
    expect((await padHeader.boundingBox())!.width).toBe(padWidth);
    // Dragging the handle must not select the header.
    await expect(noteHeader).toHaveAttribute("aria-selected", "false");
    await expect(noteHeader).not.toHaveAttribute("data-selected");

    // Keyboard: ArrowUp from a focused data cell reaches the header row, then
    // Shift+ArrowRight on the focused note header widens it by the key step.
    const idCell = rowWithNote(page, "edge-8192").getByRole("gridcell").nth(0);
    await idCell.click();
    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByRole("columnheader", { name: "id", exact: true }),
    ).toBeFocused();
    await noteHeader.press("Shift+ArrowRight");
    await expect
      .poll(async () => (await noteHeader.boundingBox())!.width)
      .toBeGreaterThanOrEqual(noteWidth + 79);
    expect((await noteHeader.boundingBox())!.width).toBeLessThanOrEqual(
      noteWidth + 81,
    );

    // Shift-click selects a clean 2x2 rectangle (id + note of rows 6,7).
    await rowWithNote(page, "empty-str").getByRole("gridcell").nth(0).click();
    await rowWithNote(page, "sql-null")
      .getByRole("gridcell")
      .nth(1)
      .click({ modifiers: ["Shift"] });
    await expect(page.locator('td[aria-selected="true"]')).toHaveCount(4);

    const copyButton = page.getByTestId("copy-selection");
    await expect(copyButton).toBeEnabled();
    await copyButton.click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("6\tempty-str\n7\tsql-null");

    // A range covering the masked secret column is refused and cannot
    // overwrite the clipboard, even via Ctrl+C from a focused cell.
    await rowWithNote(page, "empty-str").getByRole("gridcell").nth(1).click();
    await rowWithNote(page, "empty-str")
      .getByRole("gridcell")
      .nth(3)
      .click({ modifiers: ["Shift"] });
    await expect(copyButton).toBeDisabled();
    await page.keyboard.press("ControlOrMeta+C");
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("6\tempty-str\n7\tsql-null");

    // A range covering the truncated pad cell is refused; clipboard stays.
    await rowWithNote(page, "edge-8192").getByRole("gridcell").nth(1).click();
    await rowWithNote(page, "over-8193")
      .getByRole("gridcell")
      .nth(2)
      .click({ modifiers: ["Shift"] });
    await expect(copyButton).toBeDisabled();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("6\tempty-str\n7\tsql-null");

    // Selection, resize and copy are local: exactly one execute request.
    expect(executeRequests).toBe(1);
  });
});
