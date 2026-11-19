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
  const panel = page.getByRole("region", {
    name: /ClickHouse table preview|ClickHouse 表预览/,
  });
  await expect(panel).toBeVisible({ timeout: 30000 });
  await panel.getByRole("combobox").selectOption("sample");
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
  console.log(
    "PASS real Chromium login → workbench → selected ClickHouse columns → masked result and NULL",
  );
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([closed, delay(4000, undefined, { ref: false })]);
}
