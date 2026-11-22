// Run by TestRedisWorksheetHTTP against the real isolated backend and BFF.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect } from "@playwright/test";

const [backend, target, email] = process.argv.slice(2);
const controlSecret = process.env.CONTROLHUB_REDIS_FIXTURE_SECRET;
if (new URL(backend).hostname !== "127.0.0.1" || !/^\d+$/.test(target) ||
    email !== "redis-worksheet-editor@example.com" || !controlSecret) {
  throw Error("Expected local Redis fixture");
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
    CONTROLHUB_REDIS_FIXTURE_SECRET: "",
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
  const editor = page.locator('.cm-content[aria-label="Redis command"], .cm-content[aria-label="Redis 命令"]');
  const run = page.getByRole("button", { name: /^(Run|执行)$/i });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveText("");
  await page.getByRole("button", { name: /^(Objects|对象)$/i, exact: true }).click();
  const keys = page.getByRole("list", { name: /^(Approved Redis keys|已批准的 Redis 键)$/i });
  const hashKey = keys.locator("> li", { hasText: "demo:order:101" });
  await expect(hashKey).toBeVisible();
  await expect(hashKey.getByRole("list").getByText("status", { exact: true })).toBeVisible();
  await expect(hashKey.getByRole("list").getByText("region", { exact: true })).toBeVisible();
  await expect(keys.locator("> li", { hasText: "demo:order:note:101" })).toBeVisible();
  await expect(keys.locator("> li", { hasText: "demo:order:note:102" })).toBeVisible();
  await expect(keys.getByText("secret", { exact: true })).toHaveCount(0);
  await expect(keys.getByText("demo:private:101", { exact: true })).toHaveCount(0);

  const control = async (action) => {
    const response = await fetch(`${backend}/redis-fixture/${action}`, {
      method: "POST", headers: { "X-Fixture-Control": controlSecret },
    });
    expect(response.status).toBe(204);
  };
  async function execute(command, status = 200) {
    if (command !== null) {
      await editor.click();
      await editor.press("ControlOrMeta+a");
      await page.keyboard.insertText(command);
      await expect(editor).toHaveText(command);
    }
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith(`/query-targets/${target}/execute`)),
      run.click(),
    ]);
    expect(response.status()).toBe(status);
    expect(response.request().postDataJSON()).not.toHaveProperty("pagination");
    const result = await response.json();
    if (status !== 200) {
      expect(result.rows).toBeUndefined();
      await expect(page.getByRole("grid")).toHaveCount(0);
    }
    return result;
  }
  async function show(command, value) {
    const result = await execute(command);
    expect(result.engine).toBe("redis");
    expect(result.rows).toEqual([[value]]);
    await expect(page.getByRole("gridcell", { name: value, exact: true })).toBeVisible();
    return result.executionId;
  }

  const first = await show("GET demo:order:note:101", "fixture-open");
  const second = await show("GET demo:order:note:102", "fixture-shipped");
  expect(second).not.toBe(first);
  const worksheet = page.getByTestId("query-workbench-grid");
  await expect(worksheet.getByRole("button", { name: /^(Format|格式化)$/i })).toHaveCount(0);
  expect((await execute("GET demo:private:101", 403)).error).toBe("query_result_disclosure_blocked");
  expect((await execute("SET demo:order:note:101 changed", 400)).error).toBe("validation_failed");

  const hgetFirst = await show("HGET demo:order:101 status", "open");
  await show("HGET demo:order:101 region", "cn-east");
  await expect(page.getByRole("gridcell", { name: "open", exact: true })).toHaveCount(0);
  expect((await execute("HGET demo:order:101 secret", 403)).error).toBe("query_result_disclosure_blocked");
  expect((await execute("HGET demo:order:101 large", 400)).error).toBe("validation_failed");

  const empty = await execute("HGET demo:order:101 empty");
  expect(empty.rows).toEqual([[""]]);
  const cells = page.getByRole("gridcell");
  await expect(cells).toHaveCount(1);
  await expect(cells).toHaveText(/^$/);
  await expect(page.getByRole("grid").getByText("NULL", { exact: true })).toHaveCount(0);

  const missing = await execute("HGET demo:order:101 missing");
  expect(missing.rows).toEqual([[null]]);
  await expect(page.getByRole("gridcell")).toHaveText("NULL");

  await show("HGET demo:order:101 status", "open");
  await control("revoke");
  try {
    expect((await execute(null, 403)).error).toBe("query_result_disclosure_blocked");
  } finally {
    await control("restore");
  }
  await show(null, "open");
  await control("break-audit");
  try {
    expect((await execute(null, 502)).error).toBe("query_backend_error");
  } finally {
    await control("restore-audit");
  }
  const history = await (await page.request.get(`${origin}/api/proxy/query-targets/${target}/executions?pageSize=20`)).json();
  for (const [id, preview] of [[first, "Redis GET"], [second, "Redis GET"], [hgetFirst, "Redis HGET"]]) {
    expect(history.items).toContainEqual(expect.objectContaining({ id, engine: "redis", status: "success", statementPreview: preview, canRestore: false }));
  }
  const evidence = JSON.stringify(history);
  expect(evidence).not.toContain("demo:order:");
  expect(evidence).not.toContain("open");
  expect(evidence).not.toContain("cn-east");
  console.log("PASS Redis worksheet: GET and HGET on approved keys and fields, edit and rerun, hash fields in Objects, refused/blocked/too-large clears the grid, revocation and audit failure, evidence labels");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([closed, delay(4000, undefined, { ref: false })]);
}
