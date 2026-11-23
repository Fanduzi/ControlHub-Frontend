import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { checkBackendHealth } from "./harness/backend-health";
import {
  openQueryWorkbench,
  getEditor,
  clearAndType,
} from "./harness/workbench";
import { getAuthToken } from "./api.helpers";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
  type ConsoleMessage,
} from "./harness/console-guards";

const PROBE_API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

const PG_TARGET_DISPLAY_NAME = "Local PostgreSQL Query Dev";
const MYSQL_TARGET_DISPLAY_NAME = "Local MySQL Query Dev";
const MYSQL_DATABASE = "query_e2e";

let pgTargetResourceId: number | null = null;
let mysqlTargetResourceId: number | null = null;
let fixtureToken: string | null = null;

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PROBE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${fixtureToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
}

test.beforeAll(async () => {
  await checkBackendHealth();

  // Run-identity gate: prove the backend listener is THIS run's disposable
  // e2e fixture built from the pinned backend object — never whatever happens
  // to hold the port. Plain cmd/server does not serve /e2e/assembly.
  const assemblyRes = await fetch(`${PROBE_API_BASE}/e2e/assembly`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!assemblyRes.ok) {
    throw new Error(
      `E2E fixture backend not provisioned (GET /e2e/assembly -> ${assemblyRes.status}); ` +
        "this spec requires the test-only fixture listener " +
        "(scripts/e2e/pg-fixture-up.sh).",
    );
  }
  const assembly = (await assemblyRes.json()) as {
    kind?: string;
    runId?: string;
    backendSha?: string;
    listenAddr?: string;
  };
  expect(assembly.kind).toBe("controlhub-e2e-pg-fixture");
  expect(assembly.runId ?? "").not.toBe("");
  if (process.env.E2E_RUN_ID) {
    expect(assembly.runId).toBe(process.env.E2E_RUN_ID);
  }
  const pinnedSha = readFileSync("e2e/backend-fixture.env", "utf8").match(
    /^CONTROLHUB_BACKEND_SHA=([0-9a-f]{40})$/m,
  )?.[1];
  expect(
    pinnedSha,
    "e2e/backend-fixture.env must pin a full backend SHA",
  ).toBeTruthy();
  expect(assembly.backendSha).toBe(pinnedSha);

  const proxyHealth = (await (
    await fetch("http://localhost:8081/__health", {
      signal: AbortSignal.timeout(10_000),
    })
  ).json()) as { kind?: string; runId?: string | null; target?: string };
  expect(proxyHealth.kind).toBe("controlhub-e2e-api-proxy");
  // The proxy must point at the fixture listener this run stood up — derive
  // it from the environment or the assembly itself, never a fixed port.
  const expectedTarget =
    process.env.PLAYWRIGHT_PROXY_TARGET ??
    `http://localhost${assembly.listenAddr ?? ":8080"}`;
  expect(proxyHealth.target).toBe(expectedTarget);
  if (process.env.E2E_RUN_ID) {
    expect(proxyHealth.runId).toBe(process.env.E2E_RUN_ID);
  }

  fixtureToken = await getAuthToken();

  const res = await apiFetch("/query-targets");
  if (!res.ok) {
    throw new Error(`Fixture probe failed: GET /query-targets ${res.status}`);
  }
  const body = (await res.json()) as {
    items?: Array<{
      resourceId: number;
      displayName?: string;
      connectionContext?: { engine?: string };
      availableActions?: { run?: boolean };
    }>;
  };
  const targets = body.items ?? [];
  const pg = targets.find(
    (t) => t.displayName === PG_TARGET_DISPLAY_NAME,
  );
  const mysql = targets.find(
    (t) => t.displayName === MYSQL_TARGET_DISPLAY_NAME,
  );
  if (
    !pg ||
    pg.connectionContext?.engine !== "postgresql" ||
    pg.availableActions?.run !== true ||
    !mysql ||
    mysql.connectionContext?.engine !== "mysql" ||
    mysql.availableActions?.run !== true
  ) {
    throw new Error(
      `Fixture probe failed: runnable targets "${PG_TARGET_DISPLAY_NAME}" and ` +
        `"${MYSQL_TARGET_DISPLAY_NAME}" are both required by this spec.`,
    );
  }
  pgTargetResourceId = pg.resourceId;
  mysqlTargetResourceId = mysql.resourceId;
});

test.beforeEach(async () => {
  // Reset the admin workspace so persisted worksheets never leak across tests.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await apiFetch("/query-workspace");
    if (!res.ok) throw new Error(`workspace probe failed: ${res.status}`);
    const workspace = (await res.json()) as {
      worksheets?: unknown[];
      version?: number;
    };
    if (!workspace.worksheets?.length) return;
    const put = await apiFetch("/query-workspace", {
      method: "PUT",
      body: JSON.stringify({
        expectedVersion: workspace.version,
        worksheets: [],
      }),
    });
    if (put.ok) return;
    const body = await put.text();
    if (!body.includes("query_workspace_conflict") || attempt === 2) {
      throw new Error(`workspace reset failed: ${put.status} ${body}`);
    }
  }
});

let consoleMessages: ConsoleMessage[];
let networkErrors: string[];

test.beforeEach(async ({ page }) => {
  consoleMessages = collectConsoleMessages(page, {
    allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
    allowedWarnings: [/was preloaded using link preload but not used/],
  });
  networkErrors = collectNetworkErrors(page);
});

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotPath = `query-sql-scope-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  assertClean(consoleMessages, networkErrors);
});

/** Select a target by display name through the real connection navigator. */
async function selectTargetByName(
  page: Page,
  displayName: string,
  resourceId: number,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /^(Connections|连接)$/ });
  if (!(await dialog.isVisible())) {
    const trigger = page.getByRole("button", {
      name: /^(Open connections|打开连接)( on mobile|（移动端）)?$/,
    });
    await trigger.first().click();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  }
  const target = dialog.locator(`ul button[aria-label="${displayName}"]`);
  await expect(target).toBeVisible({ timeout: 10_000 });
  if ((await target.getAttribute("aria-current")) !== "true") {
    await target.click();
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  } else {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  }
  await expect
    .poll(() => new URL(page.url()).searchParams.get("targetId"), {
      timeout: 5_000,
    })
    .toBe(String(resourceId));
}

async function selectPgContext(page: Page): Promise<void> {
  await selectTargetByName(page, PG_TARGET_DISPLAY_NAME, pgTargetResourceId!);
  const contextBar = page.getByTestId("pg-context-bar");
  await expect(contextBar).toBeVisible({ timeout: 10_000 });
  const connSelect = page.getByTestId("pg-connection-select");
  await expect(connSelect).toBeVisible();
  await connSelect.selectOption("labdb");
  const schemaSelect = page.getByTestId("pg-schema-select");
  await expect(schemaSelect).toBeEnabled({ timeout: 10_000 });
  await schemaSelect.selectOption("e2e");
}

async function selectMysqlContext(page: Page): Promise<void> {
  await selectTargetByName(
    page,
    MYSQL_TARGET_DISPLAY_NAME,
    mysqlTargetResourceId!,
  );
  // The MySQL fixture waits for an explicit database choice through the real
  // quick navigator before schema completion is scoped to it.
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+P" : "Control+P",
  );
  const navigator = page.getByRole("dialog", { name: /quick navigator/i });
  await expect(navigator).toBeVisible();
  await navigator
    .getByRole("textbox", { name: /search databases and objects/i })
    .fill(MYSQL_DATABASE);
  await navigator
    .getByRole("button", { name: MYSQL_DATABASE, exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(navigator).toBeHidden();
  await expect(page.getByTestId("mysql-context-bar")).toBeVisible({
    timeout: 10_000,
  });
}

/**
 * Position the caret directly after `anchor` inside the editor by counting
 * back from the end of the typed document — never via editor evaluate.
 */
async function moveCaretAfter(page: Page, doc: string, anchor: string) {
  const anchorEnd = doc.indexOf(anchor) + anchor.length;
  const steps = doc.length - anchorEnd;
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press("ArrowLeft");
  }
}

test.describe("SQL completion scope", () => {
  test("PG CTE and derived-table columns resolve through scope, not regex", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page);

    // CTE name binds to its declared projection; `p.item_` must complete to
    // the quoted projection alias, never to the source table's raw columns.
    const cte =
      "WITH picked AS (SELECT name AS item_name FROM e2e.items) SELECT p.item_ FROM picked p ORDER BY p.item_name LIMIT 1";
    await clearAndType(page, cte);
    await moveCaretAfter(page, cte, "p.item_");
    await page.keyboard.press("Control+Space");
    const itemName = page.getByRole("option", {
      name: "item_name",
      exact: true,
    });
    await expect(itemName).toBeVisible({ timeout: 10_000 });
    await itemName.click();
    await expect(getEditor(page)).toContainText('p."item_name"');
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(
      page.getByRole("gridcell", { name: "alpha", exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // Page two of the completed statement: the same completed text with an
    // OFFSET yields the next row, proving the suggestion was executable SQL.
    const completed = cte.replace("p.item_", 'p."item_name"');
    await clearAndType(
      page,
      completed.replace("LIMIT 1", "LIMIT 1 OFFSET 1"),
    );
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(
      page.getByRole("gridcell", { name: "beta", exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole("gridcell", { name: "alpha", exact: true }),
    ).toHaveCount(0);

    // Derived table exposes only its projected columns — `name` itself is not
    // an output of the subquery and must not be offered. The caret sits right
    // after `d.` so no typed word filters the option list.
    const derived =
      "SELECT d. FROM (SELECT name AS item_name FROM e2e.items) d";
    await clearAndType(page, derived);
    await moveCaretAfter(page, derived, "d.");
    await page.keyboard.press("Control+Space");
    await expect(
      page.getByRole("option", { name: "item_name", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("option", { name: "name", exact: true }),
    ).toHaveCount(0);
  });

  test("MySQL alias columns resolve through scope and execute", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectMysqlContext(page);

    const sql =
      "SELECT o.na FROM query_e2e_items AS o ORDER BY o.id LIMIT 1";
    await clearAndType(page, sql);
    await moveCaretAfter(page, sql, "o.na");
    await page.keyboard.press("Control+Space");
    const name = page.getByRole("option", { name: "name", exact: true });
    await expect(name).toBeVisible({ timeout: 10_000 });
    await name.click();
    await expect(getEditor(page)).toContainText("o.`name`");
    await page.getByRole("button", { name: /^run$/i }).click();
    await expect(
      page.getByRole("gridcell", { name: "alpha", exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });

    // A derived table offers only its projection — the unprojected `name`
    // column must not leak into the suggestion list.
    const derived =
      "SELECT d. FROM (SELECT name AS item_name FROM query_e2e_items) AS d";
    await clearAndType(page, derived);
    await moveCaretAfter(page, derived, "d.");
    await page.keyboard.press("Control+Space");
    await expect(
      page.getByRole("option", { name: "item_name", exact: true }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("option", { name: "name", exact: true }),
    ).toHaveCount(0);
  });
});
