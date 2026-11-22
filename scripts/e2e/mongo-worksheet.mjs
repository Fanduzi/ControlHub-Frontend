// Run by TestMongoWorksheetHTTP against the real isolated backend and BFF.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const [backend, target, email] = process.argv.slice(2);
const controlSecret = process.env.CONTROLHUB_MONGO_FIXTURE_SECRET;
if (new URL(backend).hostname !== "127.0.0.1" || !/^\d+$/.test(target) ||
    email !== "mongo-worksheet-editor@example.com" || !controlSecret) {
  throw Error("Expected local MongoDB fixture");
}
const reservation = createServer().listen(0, "127.0.0.1");
await once(reservation, "listening");
const { port } = reservation.address();
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    CONTROLHUB_API_BASE_URL: backend,
    CONTROLHUB_BFF_CONSOLE_ORIGIN: origin,
    CONTROLHUB_BFF_SESSION_KEY: randomBytes(32).toString("base64"),
    CONTROLHUB_BFF_SECURE_COOKIES: "false",
    CONTROLHUB_MONGO_FIXTURE_SECRET: "",
  },
});
const closed = once(server, "exit");
let browser;
try {
  await expect.poll(async () => {
    if (server.exitCode !== null) throw Error("Console exited");
    try { return (await fetch(`${origin}/login`)).status; } catch { return 0; }
  }, { timeout: 90000 }).toBe(200);

  browser = await chromium.launch();
  const page = await browser.newPage({ locale: "en-US" });
  await page.goto(`${origin}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("secret123");
  await page.locator("button[type=submit]").click();
  await page.waitForURL((url) => url.pathname !== "/login");
  await page.goto(`${origin}/query?targetId=${target}&environmentId=2`);
  const editor = page.locator('.cm-content[aria-label="Statement"], .cm-content[aria-label="语句"]');
  const run = page.getByRole("button", { name: /^(Run|执行)$/i });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveText("");
  await page.getByRole("button", { name: /^(Objects|对象)$/i, exact: true }).click();
  const collections = page.getByRole("list", { name: /^(Approved MongoDB collections|已批准的 MongoDB 集合)$/i });
  const ordersNode = collections.locator("> li", { hasText: "orders" });
  await expect(ordersNode).toBeVisible();
  await expect(ordersNode.getByRole("list").getByText("orderNo", { exact: true })).toBeVisible();
  await expect(ordersNode.getByRole("list").getByText("status", { exact: true })).toBeVisible();
  await expect(ordersNode.getByRole("list").getByText("customer", { exact: true })).toBeVisible();
  await expect(collections.getByText("secrets", { exact: true })).toHaveCount(0);

  const control = async (action) => {
    const response = await fetch(`${backend}/mongo-fixture/${action}`, {
      method: "POST", headers: { "X-Fixture-Control": controlSecret },
    });
    expect(response.status).toBe(204);
  };
  async function execute(statement, status = 200) {
    if (statement !== null) {
      await editor.click();
      await editor.press("ControlOrMeta+a");
      await page.keyboard.insertText(statement);
      await expect(editor).toHaveText(statement);
    }
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/query-targets/${target}/execute`)),
      run.click(),
    ]);
    expect(response.status()).toBe(status);
    const body = response.request().postDataJSON();
    expect(body).not.toHaveProperty("pagination");
    expect(body).toHaveProperty("maxRows", 100);
    const result = await response.json();
    if (status !== 200) {
      expect(result.rows).toBeUndefined();
      await expect(page.getByRole("grid")).toHaveCount(0);
    }
    return result;
  }

  // 200: projected find, every visible status cell is "open".
  const openResult = await execute('db.orders.find({"status": "open"}, {"orderNo": 1, "status": 1})');
  expect(openResult.engine).toBe("mongodb");
  expect(openResult.columns.map((c) => c.name)).toEqual(["orderNo", "status"]);
  expect(openResult.rows.length).toBeGreaterThan(0);
  expect(openResult.rows.every((row) => row[1] === "open")).toBe(true);
  const worksheet = page.getByTestId("query-workbench-grid");
  await expect(worksheet.getByRole("gridcell", { name: "open", exact: true }).first()).toBeVisible();
  await expect(worksheet.getByRole("gridcell", { name: "shipped", exact: true })).toHaveCount(0);
  await expect(worksheet.getByRole("button", { name: /^(Format|格式化)$/i })).toHaveCount(0);

  // Editing the statement flips the result set; no stale "open" cells remain.
  const shippedResult = await execute('db.orders.find({"status": "shipped"}, {"orderNo": 1, "status": 1})');
  expect(shippedResult.rows.length).toBeGreaterThan(0);
  expect(shippedResult.rows.every((row) => row[1] === "shipped")).toBe(true);
  await expect(worksheet.getByRole("gridcell", { name: "shipped", exact: true }).first()).toBeVisible();
  await expect(worksheet.getByRole("gridcell", { name: "open", exact: true })).toHaveCount(0);

  // Unindexed filter, scripting, and masked-field filter each refuse with
  // controlled copy and a cleared grid.
  expect((await execute('db.orders.find({"region": "cn-east"})', 400)).error).toBe("query_index_required");
  await expect(worksheet.getByRole("alert")).toContainText(/This query must use an index|查询必须走索引/);
  expect((await execute('db.orders.find({"$where": "true"})', 400)).error).toBe("validation_failed");
  await expect(worksheet.getByRole("alert")).toContainText(/db\.<collection>\.find|db\.<集合>\.find/);
  expect((await execute('db.orders.find({"customer": "x"})', 403)).error).toBe("query_result_disclosure_blocked");

  // The 2 MiB note crosses the per-field byte cap: truncated cell + NULL,
  // while the other cells still render and masked customer stays masked.
  const big = await execute('db.orders.find({"orderNo": 2000000})');
  expect(big.rows).toHaveLength(1);
  const bigCols = big.columns.map((c) => c.name);
  expect(big.rows[0][bigCols.indexOf("note")]).toBeNull();
  expect(big.cellTruncated[0][bigCols.indexOf("note")]).toBe(true);
  expect(big.rows[0][bigCols.indexOf("customer")]).toBe("[MASKED]");
  await expect(worksheet.getByTestId("cell-truncated-badge")).toBeVisible();
  await expect(worksheet.getByRole("gridcell", { name: "cn-north", exact: true })).toBeVisible();
  await expect(worksheet.getByRole("gridcell", { name: "[MASKED]", exact: true })).toBeVisible();

  // Revoking the status field mid-session refuses the same statement.
  await control("revoke");
  try {
    expect((await execute('db.orders.find({"status": "open"}, {"orderNo": 1, "status": 1})', 403)).error).toBe("query_result_disclosure_blocked");
  } finally {
    await control("restore");
  }
  const restored = await execute(null);
  expect(restored.rows.length).toBeGreaterThan(0);

  // Audit persistence failure refuses with 502 and leaves no partial pair.
  await control("break-audit");
  try {
    expect((await execute(null, 502)).error).toBe("query_backend_error");
  } finally {
    await control("restore-audit");
  }

  // Final step: clamp the per-user minute bucket to 1 — the first Run is
  // admitted, the next is refused with 429 and the grid stays cleared.
  await control("throttle");
  const first = await execute('db.orders.find({"status": "open"}, {"orderNo": 1, "status": 1})');
  expect(first.rows.length).toBeGreaterThan(0);
  const limited = await execute(null, 429);
  expect(limited.error).toBe("query_rate_limited");
  await expect(worksheet.getByRole("alert")).toContainText(/too many runs|运行过于频繁/i);

  const history = await (await page.request.get(`${origin}/api/proxy/query-targets/${target}/executions?pageSize=20`)).json();
  for (const id of [openResult.executionId, shippedResult.executionId, big.executionId, first.executionId]) {
    expect(history.items).toContainEqual(expect.objectContaining({ id, engine: "mongodb", status: "success", statementPreview: "MongoDB find", canRestore: false }));
  }
  const evidence = JSON.stringify(history);
  for (const leak of ["orders", "open", "shipped", "cn-east", "$where", "region", "customer"]) {
    expect(evidence).not.toContain(leak);
  }
  console.log("PASS MongoDB worksheet: approved collections in Objects, find with edit and rerun, index-required/validation/disclosure clear the grid, truncated and masked cells, revocation and audit failure, throttled 429, evidence labels");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([closed, delay(4000, undefined, { ref: false })]);
}
