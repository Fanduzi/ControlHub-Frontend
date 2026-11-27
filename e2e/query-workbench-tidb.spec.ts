import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { getAuthToken } from "./api.helpers";
import {
  assertClean, collectConsoleMessages, collectNetworkErrors, takeExpectedConsoleStatusError, takeExpectedNetworkError,
} from "./harness/console-guards";
import { clearAndType, openConnectionNavigator, openQueryWorkbench } from "./harness/workbench";

const proxy = process.env.CONTROLHUB_API_PROXY_URL ?? "http://localhost:8081";

async function openTiDbWorksheet(page: Page) {
  const runId = process.env.E2E_RUN_ID;
  if (!runId || !process.env.PLAYWRIGHT_PROXY_TARGET) throw new Error("Expected the identified disposable TiDB fixture.");
  const pin = readFileSync("e2e/backend-fixture.env", "utf8").match(/^CONTROLHUB_BACKEND_SHA=([0-9a-f]{40})$/m)?.[1];
  expect(pin).toBeTruthy();
  const health = await fetch(`${proxy}/__health`, { signal: AbortSignal.timeout(10_000) });
  expect(await health.json()).toMatchObject({ kind: "controlhub-e2e-api-proxy", runId, target: process.env.PLAYWRIGHT_PROXY_TARGET });
  const assembly = await fetch(`${proxy}/e2e/assembly`, { signal: AbortSignal.timeout(10_000) });
  expect(await assembly.json()).toMatchObject({ kind: "controlhub-e2e-pg-fixture", runId, backendSha: pin });
  const token = await getAuthToken();
  const request = (path: string, init?: RequestInit) => fetch(`${proxy}${path}`, { ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10_000) });
  const resp = await request("/query-targets");
  expect(resp.ok).toBe(true);
  const { items } = await resp.json() as { items: { resourceId: number; displayName: string }[] };
  const target = items.find((item) => item.displayName === "Local TiDB Query Dev");
  if (!target) throw new Error("Disposable TiDB target is missing.");
  expect(target).toMatchObject({ connectionContext: { engine: "tidb" }, availableActions: { run: true } });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await request("/query-workspace");
    expect(res.ok).toBe(true);
    const { worksheets, version } = await res.json() as { worksheets: unknown[]; version: number };
    if (!worksheets?.length) break;
    const reset = await request("/query-workspace", { method: "PUT", body: JSON.stringify({ expectedVersion: version, worksheets: [] }) });
    if (reset.ok) break;
    if (reset.status !== 409 || attempt === 2) throw new Error(`Fixture workspace reset failed: ${reset.status}`);
  }
  await openQueryWorkbench(page);
  const dialog = await openConnectionNavigator(page);
  const targetButton = dialog.getByRole("button", { name: "Local TiDB Query Dev", exact: true });
  if (await targetButton.getAttribute("aria-current") === "true") await page.keyboard.press("Escape");
  else await targetButton.click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("targetId")).toBe(String(target.resourceId));
  const executePath = `/query-targets/${target.resourceId}/execute`;
  const posted: Record<string, unknown>[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith(executePath)) posted.push(req.postDataJSON());
  });
  return { executePath, posted, async record(key: string) {
    const res = await request(`/query-targets/${target.resourceId}/executions?clientExecutionId=${encodeURIComponent(key)}&pageSize=5`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    return data.items.find((item: { clientExecutionId: string }) => item.clientExecutionId === key);
  } };
}

function guardBrowser(page: Page) {
  const consoleMessages = collectConsoleMessages(page, {
    allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
    allowedWarnings: [/was preloaded using link preload but not used/],
  });
  const networkErrors = collectNetworkErrors(page);
  return (refusedUrl?: string) => assertClean(
    refusedUrl ? takeExpectedConsoleStatusError(consoleMessages, 403) : consoleMessages,
    refusedUrl ? takeExpectedNetworkError(networkErrors, { method: "POST", url: refusedUrl, status: 403 }) : networkErrors,
  );
}

test("TiDB ordinary Run delivers governed pages and withholds masked data", async ({ page }) => {
  const verifyBrowser = guardBrowser(page);
  const { posted } = await openTiDbWorksheet(page);
  const run = page.getByRole("button", { name: "Run", exact: true });
  await clearAndType(page, "select id, name from tidb_e2e.items order by id");
  await run.click();
  const grid = page.getByRole("grid");
  await expect(grid).toContainText("alpha");
  await page.getByRole("combobox", { name: "Page size", exact: true }).click();
  await page.getByRole("option", { name: "5", exact: true }).click();
  await expect(grid).toContainText("epsilon");
  await expect(grid).not.toContainText("zeta");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(grid).toContainText("zeta");
  await expect(grid).not.toContainText("alpha");
  await clearAndType(page, "select id, secret_note from tidb_e2e.items order by id");
  await run.click();
  await expect(grid).toContainText("secret_note");
  await expect(grid).not.toContainText("private-alpha");
  await expect(page.getByRole("button", { name: /^CSV export unavailable:/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^JSON export unavailable:/ })).toBeDisabled();
  expect(posted.map((body) => body.pagination)).toEqual([{ page: 1, pageSize: 10 }, { page: 1, pageSize: 5 }, { page: 2, pageSize: 5 }, { page: 1, pageSize: 5 }]);
  expect(posted.every((body) => !Object.hasOwn(body, "clientExecutionId"))).toBe(true);
  verifyBrowser();
});

for (const scenario of ["complete", "rejected", "cancelled"] as const) {
  test(`TiDB batch ${scenario} keeps governed results without extra submissions`, async ({ page }) => {
    const verifyBrowser = guardBrowser(page);
    const { executePath, posted, record } = await openTiDbWorksheet(page);
    const marker = `tidbbatch${crypto.randomUUID().replaceAll("-", "")}`;
    const statements = [
      "select id, name from tidb_e2e.items where id = 1;",
      scenario === "cancelled" ? `select id, note from tidb_e2e.slow_items where note <> '${marker}' order by md5(note);`
        : scenario === "rejected" ? "select id, absent_policy from tidb_e2e.items;"
        : "select id, name from tidb_e2e.items where id = 2;",
      "select id, name from tidb_e2e.items where id = 3;",
    ];
    const refused = scenario === "rejected" ? page.waitForResponse((response) =>
      response.url().endsWith(executePath) && response.request().postDataJSON()?.statement === statements[1]) : null;
    await clearAndType(page, statements.join("\n"));
    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.getByRole("button", { name: "Run selected batch", exact: true }).click();
    const refusal = await refused;
    if (scenario === "rejected") expect(refusal?.status()).toBe(403);
    if (scenario === "cancelled") {
      const monitor = process.env.E2E_TIDB_MONITOR_CONTAINER;
      if (!monitor) throw new Error("Expected the disposable TiDB processlist monitor.");
      expect(execFileSync("docker", ["inspect", "--format", '{{ index .Config.Labels "controlhub.e2e.run" }}', monitor], { encoding: "utf8" }).trim()).toBe(process.env.E2E_RUN_ID);
      await expect.poll(() => Number(execFileSync("docker", ["exec", monitor, "mysql", "--no-defaults", "-h", "127.0.0.1", "-P", "4000", "-uroot", "-N", "-e",
        `SELECT COUNT(*) FROM information_schema.processlist WHERE ID <> CONNECTION_ID() AND DB='tidb_e2e' AND INFO LIKE '%${marker}%'`],
      { encoding: "utf8", timeout: 5_000 }).trim()), { timeout: 10_000, intervals: [50, 100] }).toBeGreaterThan(0);
      await page.getByTestId("cancel-execution").click();
      await expect(page.getByTestId("cancel-outcome")).toContainText("Server outcome: failed.");
      await expect(page.getByTestId("cancel-outcome")).not.toContainText("confirmed the execution stopped");
    }
    const batch = page.getByRole("region", { name: "Batch results" });
    const count = scenario === "complete" ? 3 : 1;
    await expect(batch.getByRole("status").filter({ hasText: new RegExp(`batch ${scenario === "rejected" ? "stopped" : scenario}`, "i") })).toContainText(`${count} of 3`);
    await expect(batch.getByRole("tab")).toHaveCount(count);
    const grid = batch.getByRole("grid");
    await expect(grid).toContainText("alpha");
    if (scenario === "complete") {
      await batch.getByRole("tab", { name: "Statement 2", exact: true }).click();
      await expect(grid).toContainText("beta");
      await batch.getByRole("tab", { name: "Statement 3", exact: true }).click();
      await expect(grid).toContainText("gamma");
    }
    const sent = scenario === "complete" ? 3 : 2;
    expect(posted.map((x) => x.statement)).toEqual(statements.slice(0, sent));
    const keys = posted.map((x) => x.clientExecutionId as string);
    expect(new Set(keys).size).toBe(sent);
    for (const key of keys) expect(key).toEqual(expect.any(String));
    for (const key of keys.slice(0, count)) expect(await record(key)).toMatchObject({ kind: "execution", status: "success" });
    if (scenario === "cancelled") {
      await expect(batch.getByRole("status").filter({ hasText: /batch cancelled/i })).toContainText("database status is unknown");
      expect(await record(keys[1]!)).toMatchObject({ kind: "execution", status: "failed", errorCode: "query_canceled" });
    }
    verifyBrowser(refusal?.url());
  });
}
