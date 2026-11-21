// Run by TestClickHousePreviewHTTP against its real isolated backend and unmodified BFF.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { parse as parseCsv } from "csv-parse/sync";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const [backend, target, email] = process.argv.slice(2);
if (
  new URL(backend).hostname !== "127.0.0.1" ||
  !/^\d+$/.test(target) ||
  email !== "preview-editor@example.com"
)
  throw Error("Expected local Go fixture");
const reservation = createServer().listen(0, "127.0.0.1");
await once(reservation, "listening");
const { port } = reservation.address();
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "development",
      CONTROLHUB_API_BASE_URL: backend,
      CONTROLHUB_BFF_CONSOLE_ORIGIN: origin,
      CONTROLHUB_BFF_SESSION_KEY: randomBytes(32).toString("base64"),
      CONTROLHUB_BFF_SECURE_COOKIES: "false",
    },
  },
);
const closed = once(server, "exit");
let browser;
try {
  await expect
    .poll(
      async () => {
        if (server.exitCode !== null) throw Error("Console exited");
        try {
          return (await fetch(`${origin}/login`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 90000 },
    )
    .toBe(200);
  browser = await chromium.launch();
  const page = await browser.newPage({ locale: "en-US" });
  await page.goto(`${origin}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("secret123");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto(`${origin}/query?targetId=${target}&environmentId=2`);
  const editor = page.locator(".cm-content").first();
  const run = page.getByRole("button", { name: /^(Run|执行)$/i });
  async function executeSQL(statement, status) {
    await editor.click();
    await editor.press("ControlOrMeta+a");
    await page.keyboard.insertText(statement);
    const received = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/query-targets/${target}/execute`),
    );
    await run.click();
    const response = await received;
    expect(response.status()).toBe(status);
    return response.json();
  }
  const csvButton = page.getByTestId("export-csv");
  async function assertDownloadedPage(expectedRecords) {
    await expect(csvButton).toBeEnabled();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      csvButton.click(),
    ]);
    expect(download.suggestedFilename()).toBe("query-results.csv");
    const csv = await readFile(await download.path(), "utf8");
    expect(parseCsv(csv)).toEqual(expectedRecords);
  }
  await editor.click();
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText("SELECT  FROM ");
  await editor.press("Control+Space");
  const suggestions = page.locator(".cm-tooltip-autocomplete");
  await expect(
    suggestions.getByRole("option", { name: "events", exact: true }),
  ).toBeVisible();
  await expect(
    suggestions.getByRole("option", { name: "sample", exact: true }),
  ).toHaveCount(0);
  await editor.press("Escape");
  await page.keyboard.type("ev");
  await suggestions
    .getByRole("option", { name: "events", exact: true })
    .click();
  await expect(editor).toHaveText("SELECT  FROM events");
  await editor.press("Home");
  for (let i = 0; i < "SELECT ".length; i++) await editor.press("ArrowRight");
  await editor.press("Control+Space");
  await expect(
    suggestions.getByRole("option", { name: "request_id", exact: true }),
  ).toBeVisible();
  await expect(
    suggestions.getByRole("option", { name: "missing_date", exact: true }),
  ).toHaveCount(0);
  await expect(
    suggestions.getByRole("option", { name: "service", exact: true }),
  ).toHaveCount(0);
  await editor.press("Escape");
  await page.keyboard.type("req");
  await suggestions
    .getByRole("option", { name: "request_id", exact: true })
    .click();
  await editor.press("End");
  await page.keyboard.insertText(" WHERE request_id = 42 LIMIT 10");
  const completed = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith(`/query-targets/${target}/execute`),
  );
  await run.click();
  const executed = await completed;
  expect(executed.request().postDataJSON().statement).toBe(
    "SELECT request_id FROM events WHERE request_id = 42 LIMIT 10",
  );
  expect(executed.status()).toBe(200);
  await expect(
    page.getByRole("gridcell", { name: "42", exact: true }),
  ).toBeVisible();
  console.log(
    "PASS real ClickHouse worksheet: complete ev → events, req → request_id, Run → 42",
  );
  async function explainSQL(statement, expectedStatus) {
    await editor.click();
    await editor.press("ControlOrMeta+a");
    await page.keyboard.insertText(statement);
    const received = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/query-targets/${target}/explain`),
    );
    await page.getByTestId("explain-trigger").click();
    const r = await received;
    expect(r.status()).toBe(expectedStatus);
    return r.json();
  }
  const aggregate = "SELECT request_date, count() AS hits FROM plan_events";
  const ordered = " GROUP BY request_date ORDER BY hits DESC";
  const allPlan = await explainSQL(aggregate + ordered, 200);
  expect(allPlan.engine).toBe("clickhouse");
  const all = allPlan.nodes.find(
    (n) => n.primaryKeyGranules,
  )?.primaryKeyGranules;
  expect(all.selected).toBe(all.initial);
  expect(all.initial).toBeGreaterThan(1);
  const panelPlan = page.getByTestId("explain-panel");
  const granulesText = (pair) =>
    new RegExp(`${pair.selected}\\s*(of|/)\\s*${pair.initial}`);
  await expect(panelPlan.getByText(granulesText(all))).toBeVisible();
  const filtered = await explainSQL(
    aggregate +
      " WHERE request_date >= '2026-02-01' AND request_date < '2026-02-08'" +
      ordered,
    200,
  );
  const pruned = filtered.nodes.find(
    (n) => n.primaryKeyGranules,
  )?.primaryKeyGranules;
  expect(pruned.initial).toBe(all.initial);
  expect(pruned.selected).toBeLessThan(all.selected);
  await expect(panelPlan.getByText(granulesText(pruned))).toBeVisible();
  await panelPlan.getByRole("button", { name: /^(Text|文本视图)$/i }).click();
  await expect(page.getByTestId("explain-text")).toContainText(
    granulesText(pruned),
  );
  const refused = await explainSQL(
    "SELECT id FROM plan_events WHERE private_label = 'fixture-private'",
    403,
  );
  expect(refused.error).toBe("query_result_disclosure_blocked");
  expect(refused.nodes).toBeUndefined();
  await expect(page.getByTestId("explain-error")).toBeVisible();
  await expect(page.getByTestId("explain-ready")).toHaveCount(0);
  await page.getByTestId("explain-close").click();
  console.log(
    `PASS governed ClickHouse Explain: primary-key granules ${all.selected}/${all.initial} → ${pruned.selected}/${pruned.initial}; masked predicate clears previous plan`,
  );
  const executions = [];
  for (const id of ["42", "43"]) {
    const result = await executeSQL(
      `SELECT request_id FROM events WHERE request_id = ${id} LIMIT 10`,
      200,
    );
    executions.push(result.executionId);
    expect(result.rows).toEqual([[id]]);
    await expect(
      page.getByRole("gridcell", { name: id, exact: true }),
    ).toBeVisible();
  }
  expect(executions[0]).not.toBe(executions[1]);
  const history = await (
    await page.request.get(
      `${origin}/api/proxy/query-targets/${target}/executions?pageSize=20`,
    )
  ).json();
  for (const id of executions)
    expect(history.items).toContainEqual(
      expect.objectContaining({
        id,
        status: "success",
        engine: "clickhouse",
        rowCount: 1,
      }),
    );
  const pagingSql =
    "SELECT request_id FROM page_events ORDER BY request_id LIMIT ";
  const next = page.getByRole("button", { name: /^(Next page|下一页)$/i });
  const previous = page.getByRole("button", {
    name: /^(Previous page|上一页)$/i,
  });
  async function pageAction(action, status = 200) {
    const received = page.waitForResponse(
      (r) =>
        r.request().method() === "POST" &&
        r.url().endsWith(`/query-targets/${target}/execute`),
    );
    await action();
    const response = await received;
    expect(response.status()).toBe(status);
    return response.json();
  }
  async function checkPage(data, pageNumber, first, size, hasNext) {
    const ids = Array.from({ length: size }, (_, i) => String(first + i));
    expect(data.rows).toEqual(ids.map((id) => [id]));
    expect(data.pagination).toEqual({
      page: pageNumber,
      pageSize: 5,
      hasPreviousPage: pageNumber > 1,
      hasNextPage: hasNext,
    });
    await expect(page.getByRole("gridcell")).toHaveText(ids);
    if (hasNext) await expect(next).toBeEnabled();
    else await expect(next).toBeDisabled();
    if (pageNumber > 1) await expect(previous).toBeEnabled();
    else await expect(previous).toBeDisabled();
  }
  await executeSQL(pagingSql + "12", 200);
  await page.getByRole("combobox", { name: /^(Page size|每页行数)$/i }).click();
  const first = await pageAction(() =>
    page.getByRole("option", { name: "5", exact: true }).click(),
  );
  await checkPage(first, 1, 1, 5, true);
  const second = await pageAction(() => next.click());
  await checkPage(second, 2, 6, 5, true);
  await assertDownloadedPage([
    ["request_id"],
    ["6"],
    ["7"],
    ["8"],
    ["9"],
    ["10"],
  ]);
  const third = await pageAction(() => next.click());
  await checkPage(third, 3, 11, 2, false);
  const back = await pageAction(() => previous.click());
  await checkPage(back, 2, 6, 5, true);
  expect(
    new Set([first, second, third, back].map((x) => x.executionId)).size,
  ).toBe(4);
  await checkPage(await executeSQL(pagingSql + "3", 200), 1, 1, 3, false);
  await checkPage(await executeSQL(pagingSql + "12", 200), 1, 1, 5, true);
  // Update the actual fixture's disclosure policy through the admin API between two browser reads.
  const adminLogin = await fetch(`${backend}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "preview-admin@example.com",
      password: "secret123",
    }),
  });
  expect(adminLogin.status).toBe(200);
  const { token: adminToken } = await adminLogin.json();
  async function setPolicy(mode) {
    const res = await fetch(`${backend}/query-disclosure-policies`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetResourceId: Number(target),
        databaseName: "g2",
        objectName: "page_events",
        columnName: "request_id",
        mode,
      }),
    });
    expect(res.status).toBe(204);
  }
  await setPolicy("masked_no_copy");
  try {
    const refusal = await pageAction(() => next.click(), 403);
    expect(refusal.error).toBe("query_result_disclosure_blocked");
    expect(refusal.rows).toBeUndefined();
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(next).toHaveCount(0);
  } finally {
    await setPolicy("raw_copy_allowed");
  }
  console.log(
    "PASS ClickHouse worksheet paging: 5/5/2, previous, edited LIMIT and live policy revocation",
  );
  const grouped = await executeSQL(
    "SELECT request_id, count() AS hits FROM events GROUP BY request_id ORDER BY hits DESC LIMIT 1",
    200,
  );
  expect(grouped.rows).toEqual([["18446744073709551615", "6"]]);
  await expect(
    page.getByRole("gridcell", { name: "6", exact: true }),
  ).toBeVisible();
  await assertDownloadedPage([
    ["request_id", "hits"],
    ["18446744073709551615", "6"],
  ]);
  await executeSQL(
    "SELECT request_id, private_time FROM events WHERE request_id = 42",
    200,
  );
  await expect(
    page.getByRole("gridcell", { name: "[MASKED]", exact: true }),
  ).toBeVisible();
  await expect(csvButton).toBeDisabled();
  console.log(
    "PASS ClickHouse current-page CSV: only page 2, exact UInt64, whole-page refusal on a masked column",
  );
  const daily = (start) =>
    `SELECT request_date, count() AS requests FROM http_log WHERE request_date >= '${start}' AND request_date < '2026-11-20' GROUP BY request_date ORDER BY request_date`;
  const full = await executeSQL(daily("2026-11-13"), 200);
  expect(full.rows).toEqual([
    ["2026-11-13", "2"],
    ["2026-11-19", "1"],
  ]);
  await expect(
    page.getByRole("gridcell", { name: "2026-11-13", exact: true }),
  ).toBeVisible();
  const narrowed = await executeSQL(daily("2026-11-14"), 200);
  expect(narrowed.rows).toEqual([["2026-11-19", "1"]]);
  await expect(
    page.getByRole("gridcell", { name: "2026-11-13", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("gridcell", { name: "2026-11-19", exact: true }),
  ).toBeVisible();
  const blocked = await executeSQL(
    "SELECT service FROM http_log WHERE service='api' OR (request_date >= '2026-11-13' AND private_label='test')",
    403,
  );
  expect(blocked.error).toBe("query_result_disclosure_blocked");
  expect(blocked.rows).toBeUndefined();
  await expect(page.getByRole("grid")).toHaveCount(0);
  console.log(
    "PASS ClickHouse dialect AST: edited half-open date range changes the worksheet grid; nested masked predicate refused",
  );
  const denied = await executeSQL(
    "SELECT request_id FROM events WHERE private_time = '2026-11-19T00:00:00Z'",
    403,
  );
  expect(denied.error).toBe("query_result_disclosure_blocked");
  expect(denied.rows).toBeUndefined();
  await expect(page.getByRole("grid")).toHaveCount(0);
  console.log(
    "PASS user-authored ClickHouse SQL in shared worksheet: edit 42 to 43, aggregate, reject unauthorized predicate",
  );
  await page
    .locator("summary")
    .filter({ hasText: /ClickHouse table preview|ClickHouse 表预览/ })
    .click();
  const panel = page.getByRole("region", {
    name: /ClickHouse table preview|ClickHouse 表预览/,
  });
  await expect(panel).toBeVisible({ timeout: 30000 });
  await panel
    .getByRole("combobox", { name: /^Table$|^表$/ })
    .selectOption("sample");
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith("/clickhouse-preview"),
  );
  await panel.getByRole("button", { name: /Preview rows|预览数据/ }).click();
  const raw = await (await response).text();
  expect(raw).not.toContain("synthetic-private");
  await expect(
    panel.getByRole("cell", { name: "[MASKED]", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("cell", { name: "研发", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("cell", { name: "NULL", exact: true }),
  ).toHaveCount(2);
  await panel.getByRole("checkbox", { name: "secret", exact: true }).uncheck();
  await expect(panel.getByRole("table")).toHaveCount(0);
  await panel.getByRole("button", { name: /Preview rows|预览数据/ }).click();
  await expect(
    panel.getByRole("columnheader", { name: "title", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("columnheader", { name: "secret", exact: true }),
  ).toHaveCount(0);
  await panel
    .getByRole("combobox", { name: /^Table$|^表$/ })
    .selectOption("events");
  await panel.getByRole("button", { name: /Preview rows|预览数据/ }).click();
  await expect(
    panel
      .getByRole("cell", { name: "18446744073709551615", exact: true })
      .first(),
  ).toBeVisible();
  const axis = panel.getByRole("combobox", { name: /Time column|时间列/ });
  expect(await axis.locator("option").allTextContents()).toEqual([
    "observed_at",
    "request_date",
  ]);
  await axis.selectOption("observed_at");
  const countResponse = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith("/clickhouse-preview"),
  );
  await panel
    .getByRole("button", { name: /Count rows by day|按日统计行数/ })
    .click();
  const count = await (await countResponse).json();
  expect(count.rows).toHaveLength(7);
  expect(
    count.rows.every(
      ([day, n]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && typeof n === "string",
    ),
  ).toBe(true);
  await expect(
    panel.getByRole("columnheader", { name: "count", exact: true }),
  ).toBeVisible();
  await expect(panel.locator("tbody tr")).toHaveCount(7);
  console.log(
    "PASS seven UTC daily counts and lossless UInt64 through the real workbench",
  );
  const savedSql = "SELECT request_date, count() AS count FROM plan_events WHERE request_date >= :start_date AND request_date < :end_date GROUP BY request_date ORDER BY request_date";
  await editor.click();
  await editor.press("ControlOrMeta+a");
  await page.keyboard.insertText(savedSql);
  const savedTab = page.getByRole("tab", {
    name: /^(Saved sheets|已保存脚本)$/i,
  });
  const savedName = "ClickHouse browser date range";
  await savedTab.click();
  await page
    .getByRole("button", {
      name: /^(Save current statement as personal|将当前语句保存为个人查询)$/i,
    })
    .click();
  const form = page.getByRole("dialog");
  await expect(
    form.getByRole("textbox", { name: /^(SQL statement|SQL 语句)$/i }),
  ).toHaveValue(savedSql);
  const addParameter = form.getByRole("button", { name: /^(Add parameter|添加参数)$/i });
  for (const [index, name] of ["start_date", "end_date"].entries()) {
    await addParameter.click();
    await form.getByTestId(`parameter-row-${index}`)
      .getByRole("textbox", { name: /^(Name|名称)$/i }).fill(name);
  }
  await form
    .getByRole("textbox", { name: /^(Statement name|语句名称)$/i })
    .fill(savedName);
  const written = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().endsWith(`/query-targets/${target}/saved-statements`),
  );
  await form.getByRole("button", { name: /^(Create|创建)$/i }).click();
  expect((await written).status()).toBe(201);
  const loadSaved = page.getByRole("button", {
    name: new RegExp(`^(Load|加载) ${savedName}$`),
  });
  await expect(loadSaved).toBeVisible();
  await page.reload();
  await savedTab.click();
  await loadSaved.click();
  await expect(editor).toHaveText(savedSql);
  const startDate = page.getByRole("textbox", { name: /^(start_date value|start_date 参数值)$/i });
  const endDate = page.getByRole("textbox", { name: /^(end_date value|end_date 参数值)$/i });
  await expect(startDate).toHaveValue("");
  await expect(endDate).toHaveValue("");
  async function runTemplate(action, status = 200) {
    const pending = page.waitForResponse((r) => r.request().method() === "POST" &&
      r.url().includes(`/query-targets/${target}/saved-statements/`) && r.url().endsWith("/execute"));
    await action();
    const response = await pending;
    expect(response.status()).toBe(status);
    return response.json();
  }
  await startDate.fill("2026-11-12");
  expect((await runTemplate(() => run.click(), 400)).details).toEqual({ end_date: "missing" });
  await expect(page.getByRole("grid")).toHaveCount(0);
  await endDate.fill("2026-11-14");
  expect((await runTemplate(() => run.click())).rows).toEqual([["2026-11-12", "1"], ["2026-11-13", "1"]]);
  await expect(page.getByRole("gridcell", { name: "2026-11-13", exact: true })).toBeVisible();
  await endDate.fill("2026-11-31");
  expect((await runTemplate(() => run.click(), 400)).details).toEqual({ end_date: "invalid" });
  await expect(page.getByRole("grid")).toHaveCount(0);
  await startDate.fill("2026-11-19");
  await endDate.fill("2026-11-27");
  const range = await runTemplate(() => run.click());
  expect(range.rows[0]).toEqual(["2026-11-19", "1"]);
  await page.getByRole("combobox", { name: /^(Page size|每页行数)$/i }).click();
  const templateFirst = await runTemplate(() => page.getByRole("option", { name: "5", exact: true }).click());
  expect(templateFirst.rows.map((row) => row[0])).toEqual(["2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]);
  const templateSecond = await runTemplate(() => next.click());
  expect(templateSecond.pagination.page).toBe(2);
  expect(templateSecond.rows.map((row) => row[0])).toEqual(["2026-11-24", "2026-11-25", "2026-11-26"]);
  await runTemplate(() => previous.click());
  const updateDatePolicy = async (mode) => {
    const r = await fetch(`${backend}/query-disclosure-policies`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        targetResourceId: Number(target),
        databaseName: "g2",
        objectName: "plan_events",
        columnName: "request_date",
        mode,
      }),
    });
    expect(r.status).toBe(204);
  };
  await updateDatePolicy("masked_no_copy");
  try {
    const deniedSaved = await runTemplate(() => next.click(), 403);
    expect(deniedSaved.error).toBe("query_result_disclosure_blocked");
    await expect(page.getByRole("grid")).toHaveCount(0);
    await expect(next).toHaveCount(0);
  } finally {
    await updateDatePolicy("raw_copy_allowed");
  }
  await page.reload();
  await savedTab.click();
  await loadSaved.click();
  await expect(startDate).toHaveValue("");
  await expect(endDate).toHaveValue("");
  console.log(
    "PASS ClickHouse personal template: save, refresh, load, Run two ranges, page and reject missing values, invalid dates and revoked policy",
  );
  console.log(
    "PASS real Chromium login → workbench → selected ClickHouse columns → masked result and NULL",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([closed, delay(4000, undefined, { ref: false })]);
}
