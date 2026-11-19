// Run by TestClickHousePreviewHTTP against its real isolated backend and unmodified BFF.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
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
  const grouped = await executeSQL(
    "SELECT request_id, count() AS hits FROM events GROUP BY request_id ORDER BY hits DESC LIMIT 1",
    200,
  );
  expect(grouped.rows).toEqual([["18446744073709551615", "6"]]);
  await expect(
    page.getByRole("gridcell", { name: "6", exact: true }),
  ).toBeVisible();
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
  console.log(
    "PASS real Chromium login → workbench → selected ClickHouse columns → masked result and NULL",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([closed, delay(4000, undefined, { ref: false })]);
}
