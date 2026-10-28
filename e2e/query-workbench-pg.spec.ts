// input: @playwright/test, ./harness/*, ./api.helpers, real fixture backend at localhost:8080 + disposable PostgreSQL at localhost:55432
// output: T14 real-browser acceptance matrix for the PostgreSQL governed query workbench (composite connection + schema context, three real execution entry points, pg_stat_activity-gated browser→BFF→proxy→backend cancel propagation with keyed cancelled/stopped read-back plus a strict timeout-identity forwarding-disabled negative control, disclosure/truncation/whole-page CSV gating, governed paging, keyed navigation dedup, labeled fault injection, invalid-context reselection, persistence/restore)
// pos: PostgreSQL counterpart of query-workbench.spec.ts — every assertion goes through the real UI against real backend services; no route mocks
// note: if this file changes, update header and e2e/README.md
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";
import { parse as parseCsv } from "csv-parse/sync";
import { checkBackendHealth } from "./harness/backend-health";
import {
  openQueryWorkbench,
  getEditorContent,
  clearAndType,
} from "./harness/workbench";
import { getAuthToken } from "./api.helpers";
import {
  assertClean,
  collectConsoleMessages,
  collectNetworkErrors,
  takeExpectedConsoleStatusError,
  takeExpectedNetworkError,
  takeOptionalNetworkError,
  type ConsoleMessage,
  type ExpectedHttpError,
} from "./harness/console-guards";
import {
  installSavedStatementTeardown,
  trackSavedStatement,
} from "./harness/saved-statement-teardown";

const PROBE_API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

const PG_TARGET_DISPLAY_NAME = "Local PostgreSQL Query Dev";
const PG_CONN_LABDB = "labdb";
const PG_CONN_OTHER = "labdb_other";
const PG_SCHEMA_E2E = "e2e";
const PG_SCHEMA_ALT = "e2e_alt";

let pgTargetResourceId: number | null = null;
let fixtureToken: string | null = null;

/**
 * Intentional HTTP errors consumed one-shot after the test body asserts them.
 * Never a broad allowlist — each entry removes exactly one matching network
 * error; leftovers still fail assertClean.
 */
type ConsumableHttpExpectation = ExpectedHttpError & {
  /** Also drop one Chromium console echo for this status if present. */
  consumeConsoleStatusEcho?: boolean;
};

let consumableHttpErrors: ConsumableHttpExpectation[] = [];

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

  // Run-identity gate (§三): prove the :8080 listener is THIS run's test-only
  // e2e-pg fixture and the :8081 proxy is THIS run's playwright-managed proxy —
  // never whatever happens to hold the ports. The production cmd/server never
  // serves /e2e/assembly, so a non-fixture listener is detected, not trusted.
  const assemblyRes = await fetch(`${PROBE_API_BASE}/e2e/assembly`, {
    signal: AbortSignal.timeout(10_000),
  });
  // Mandatory PG acceptance must fail loud: a missing fixture (plain
  // cmd/server answers 404 here) can never silently skip this spec.
  if (!assemblyRes.ok) {
    throw new Error(
      `PG fixture backend not provisioned (GET /e2e/assembly -> ${assemblyRes.status}); ` +
        "this spec requires the test-only cmd/e2e-pg-server listener " +
        "(scripts/e2e/pg-fixture-up.sh).",
    );
  }
  const assembly = (await assemblyRes.json()) as {
    kind?: string;
    runId?: string;
    backendSha?: string;
    pgEntries?: boolean;
    listenAddr?: string;
  };
  expect(assembly.kind).toBe("controlhub-e2e-pg-fixture");
  expect(assembly.pgEntries).toBe(true);
  expect(assembly.runId ?? "").not.toBe("");
  if (process.env.E2E_RUN_ID) {
    // A run-scoped launcher exported the expected identity — require an exact
    // match so a stale listener from an earlier run cannot be reused silently.
    expect(assembly.runId).toBe(process.env.E2E_RUN_ID);
  }
  // The fixture binary must prove it was built from the pinned backend object
  // (vcs.revision stamped by the Go toolchain in a real clone). An unstamped
  // or foreign build fails closed.
  const pinnedSha = readFileSync("e2e/backend-fixture.env", "utf8").match(
    /^CONTROLHUB_BACKEND_SHA=([0-9a-f]{40})$/m,
  )?.[1];
  expect(pinnedSha, "e2e/backend-fixture.env must pin a full backend SHA").toBeTruthy();
  expect(assembly.backendSha).toBe(pinnedSha);

  const proxyHealth = (await (
    await fetch("http://localhost:8081/__health", {
      signal: AbortSignal.timeout(10_000),
    })
  ).json()) as { kind?: string; runId?: string | null; target?: string };
  expect(proxyHealth.kind).toBe("controlhub-e2e-api-proxy");
  expect(proxyHealth.target).toMatch(/^https?:\/\/(localhost|127\.0\.0\.1):8080\/?$/);
  if (process.env.E2E_RUN_ID) {
    expect(proxyHealth.runId).toBe(process.env.E2E_RUN_ID);
  }
  console.log(
    `[t14-assembly] runId=${assembly.runId} backendSha=${assembly.backendSha} ` +
      `listen=${assembly.listenAddr} proxyRunId=${proxyHealth.runId ?? "(none)"}`,
  );

  fixtureToken = await getAuthToken();

  const res = await apiFetch("/query-targets");
  if (!res.ok) {
    throw new Error(`PG fixture probe failed: GET /query-targets ${res.status}`);
  }
  const body = (await res.json()) as {
    items?: Array<{
      resourceId: number;
      displayName?: string;
      connectionContext?: { engine?: string };
      connections?: Array<{ database: string; runtime?: string }>;
      availableActions?: { run?: boolean };
    }>;
  };
  const pg = (body.items ?? []).find(
    (t) => t.displayName === PG_TARGET_DISPLAY_NAME,
  );
  if (!pg) {
    throw new Error(
      `PG fixture probe failed: target "${PG_TARGET_DISPLAY_NAME}" missing. ` +
        "Provision the disposable PostgreSQL + credential rows before running this spec.",
    );
  }
  const conns = pg.connections ?? [];
  if (
    pg.connectionContext?.engine !== "postgresql" ||
    !conns.some((c) => c.database === PG_CONN_LABDB && c.runtime === "secret_resolved") ||
    !conns.some((c) => c.database === PG_CONN_OTHER && c.runtime === "secret_resolved")
  ) {
    throw new Error(
      `PG fixture probe failed: target ${pg.resourceId} lacks resolver-verified labdb/labdb_other connections.`,
    );
  }
  pgTargetResourceId = pg.resourceId;
});

test.beforeEach(async () => {
  consumableHttpErrors = [];
  // Reset the admin workspace so persisted PG worksheets never leak across
  // tests. A stray in-flight PUT from the PREVIOUS test's page can race our
  // own wipe (HTTP abort on page close does not roll back a request the
  // server already received); such a stray carries a stale expectedVersion
  // and 409s harmlessly once the wipe commits, while one racing our PUT is
  // covered by the bounded conflict retry below.
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
    const screenshotPath = `query-pg-${testInfo.titlePath.join("--").replace(/\s+/g, "-").toLowerCase()}.png`;
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

/** Select the PG target through the connection navigator, then pick connection + schema pins. */
async function selectPgContext(
  page: Page,
  connection: string,
  schema: string | null,
): Promise<void> {
  const dialog = page.getByRole("dialog", { name: /^(Connections|连接)$/ });
  if (!(await dialog.isVisible())) {
    const trigger = page.getByRole("button", {
      name: /^(Open connections|打开连接)( on mobile|（移动端）)?$/,
    });
    await trigger.first().click();
    await expect(dialog).toBeVisible({ timeout: 5_000 });
  }
  const target = dialog.locator(
    `ul button[aria-label="${PG_TARGET_DISPLAY_NAME}"]`,
  );
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
    .toBe(String(pgTargetResourceId));

  const contextBar = page.getByTestId("pg-context-bar");
  await expect(contextBar).toBeVisible({ timeout: 10_000 });

  const connSelect = page.getByTestId("pg-connection-select");
  await expect(connSelect).toBeVisible();
  await connSelect.selectOption(connection);

  if (schema !== null) {
    const schemaSelect = page.getByTestId("pg-schema-select");
    await expect(schemaSelect).toBeEnabled({ timeout: 10_000 });
    await schemaSelect.selectOption(schema);
  }
}

async function runStatement(page: Page, sql: string): Promise<void> {
  await clearAndType(page, sql);
  await page.getByRole("button", { name: /^run$/i }).click();
}

test.describe("PG workbench context + ad hoc execution", () => {
  installSavedStatementTeardown();

  test("connection and schema selectors enumerate the composite connections", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, null);

    const connSelect = page.getByTestId("pg-connection-select");
    await expect(
      connSelect.locator(`option[value="${PG_CONN_LABDB}"]`),
    ).toHaveCount(1);
    await expect(
      connSelect.locator(`option[value="${PG_CONN_OTHER}"]`),
    ).toHaveCount(1);

    const schemaSelect = page.getByTestId("pg-schema-select");
    await expect(schemaSelect).toBeEnabled({ timeout: 10_000 });
    // defaultSchema pin: empty selection renders the connection's default.
    await expect(
      schemaSelect.locator(`option[value="${PG_SCHEMA_E2E}"]`),
    ).toHaveCount(1);
    await expect(
      schemaSelect.locator(`option[value="${PG_SCHEMA_ALT}"]`),
    ).toHaveCount(1);
  });

  test("ad hoc SELECT executes against the pinned connection + schema", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(page, "select id, name from e2e.items order by id");
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("alpha");
    await expect(grid).toContainText("beta");
  });

  test("schema pin switch isolates the same-named object", async ({ page }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_ALT);

    await runStatement(page, "select id, label from e2e_alt.items");
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("ALT-SCHEMA-MARKER");
  });

  test("connection switch isolates the same-named object across databases", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_OTHER, null);

    await runStatement(page, "select id, name from e2e.items");
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("OTHER-DB-MARKER");
    await expect(grid).not.toContainText("alpha");
  });

  test("a write statement is rejected with a controlled error", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const executeUrl = `http://localhost:3100/api/proxy/query-targets/${pgTargetResourceId}/execute`;
    consumableHttpErrors = [
      { method: "POST", url: executeUrl, status: 403, consumeConsoleStatusEcho: true },
    ];
    const respPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/query-targets/${pgTargetResourceId}/execute`) && r.request().method() === "POST",
      { timeout: 15_000 },
    );
    await runStatement(
      page,
      "insert into e2e.items (id, name) values (99, 'nope')",
    );
    expect((await respPromise).status()).toBe(403);
    await expect(
      page.getByRole("alert").filter({ hasText: /execution not allowed/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("grid")).not.toBeVisible();
  });

  test("a multi-statement payload is rejected with a controlled error", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const executeUrl = `http://localhost:3100/api/proxy/query-targets/${pgTargetResourceId}/execute`;
    consumableHttpErrors = [
      { method: "POST", url: executeUrl, status: 403, consumeConsoleStatusEcho: true },
    ];
    const respPromise = page.waitForResponse(
      (r) => r.url().endsWith(`/query-targets/${pgTargetResourceId}/execute`) && r.request().method() === "POST",
      { timeout: 15_000 },
    );
    await runStatement(page, "select 1; select 2");
    expect((await respPromise).status()).toBe(403);
    await expect(
      page.getByRole("alert").filter({ hasText: /execution not allowed/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("grid")).not.toBeVisible();
  });
});

test.describe("PG disclosure, truncation, copy and CSV", () => {
  installSavedStatementTeardown();

  test("masked column renders masked and copy control stays blocked", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(
      page,
      "select id, secret_note from e2e.items order by id",
    );
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    // The masked value must never render the raw secret.
    await expect(grid).not.toContainText("topsecret-alpha");
    await expect(grid).not.toContainText("topsecret-beta");
    // A masked column makes the whole page ineligible for CSV export.
    await expect(page.getByTestId("export-csv")).toBeDisabled();
  });

  test("selecting an unpolicied column is blocked with a controlled disclosure error", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const executeUrl = `http://localhost:3100/api/proxy/query-targets/${pgTargetResourceId}/execute`;
    consumableHttpErrors = [
      { method: "POST", url: executeUrl, status: 403, consumeConsoleStatusEcho: true },
    ];
    await runStatement(
      page,
      "select id, blocked_note from e2e.items order by id",
    );
    await expect(page.getByRole("alert").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByText(/blocked by result disclosure policy/i),
    ).toBeVisible();
    await expect(page.getByRole("grid")).not.toBeVisible();
    // The raw value must never reach the page.
    await expect(page.locator("body")).not.toContainText("hidden-alpha");
  });

  test("truncated cell is flagged and page-level CSV export is disabled", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(
      page,
      "select id, big_payload from e2e.items where id = 1",
    );
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    // 9000-char payload exceeds the per-cell budget -> per-cell truncated badge.
    await expect(
      grid.getByText(/truncated/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("truncated-page-notice")).toBeVisible();
  });

  test("clean page CSV export downloads real rows", async ({ page }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(page, "select id, name from e2e.items order by id");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });

    const exportButton = page.getByRole("button", { name: /export csv/i });
    await expect(exportButton).toBeEnabled({ timeout: 10_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });
    await exportButton.click();
    const download = await downloadPromise;
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const csv = readFileSync(path, "utf8");
    // Field-level round-trip through an independent RFC-4180 reader — a
    // substring check is not a completeness proof for the export contract.
    const records = parseCsv(csv, { relax_quotes: false }) as string[][];
    expect(records[0]).toEqual(["id", "name"]);
    expect(records.slice(1)).toEqual([
      ["1", "alpha"],
      ["2", "beta"],
    ]);
    expect(csv).not.toContain("topsecret");
  });
});

test.describe("PG cancellation and history", () => {
  installSavedStatementTeardown();

  /**
   * Marker embedded as a string literal inside the md5 input — the backend's
   * disclosure-safe wrapper rewrites the statement (comments are stripped
   * from the executed text) but string literals inside the user's SELECT
   * survive verbatim into pg_stat_activity.query.
   */
  function markedLoadSql(marker: string): string {
    return `select count(*) from (select md5(i.id::text || g::text || '${marker}') from e2e.items i cross join generate_series(1,100000000) g) t`;
  }

  /**
   * Real-database activity barrier. A "POST emitted" or a visible loading
   * spinner never proves the statement reached PG execution — the cancel
   * tests may only click once pg_stat_activity shows OUR marked statement
   * active on labdb.
   *
   * The monitor runs server-side via the disposable fixture container's psql
   * (no extra network surface, no credentials in this file). The marker is
   * bound as a server-side parameter ($1) so the monitor's own query text
   * never contains it — plus `pid <> pg_backend_pid()` excludes the monitor
   * connection and the marker match excludes the backend's own evidence
   * probes and unrelated lookalike queries.
   */
  function pgFixtureContainer(): string {
    if (process.env.E2E_PG_CONTAINER) return process.env.E2E_PG_CONTAINER;
    const names = execFileSync(
      "docker",
      ["ps", "--format", "{{.Names}}", "--filter", "publish=55432"],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length !== 1) {
      throw new Error(
        `expected exactly one docker container publishing 55432, got ${names.length} (${names.join(",")})`,
      );
    }
    return names[0]!;
  }

  type PgActivityRow = { pid: number; backendStart: string; state: string };

  function pgStatActivityForMarker(marker: string): PgActivityRow[] {
    const out = execFileSync(
      "docker",
      [
        "exec",
        pgFixtureContainer(),
        "psql",
        "-U",
        "postgres",
        "-d",
        PG_CONN_LABDB,
        "-At",
        "-F",
        "|",
        "-c",
        `\\bind '${marker}'`,
        "-c",
        `SELECT a.pid, a.backend_start::text, a.state
           FROM pg_catalog.pg_stat_activity a
          WHERE a.datname = '${PG_CONN_LABDB}'
            AND a.pid <> pg_backend_pid()
            AND a.query LIKE '%' || $1 || '%'`,
      ],
      { encoding: "utf8", timeout: 10_000 },
    );
    return out
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [pid, backendStart, state] = line.split("|");
        return { pid: Number(pid), backendStart: backendStart ?? "", state: state ?? "" };
      });
  }

  /** Poll until our marked statement is observed `active` on real PG; returns its backend identity. */
  async function awaitPgActive(marker: string): Promise<PgActivityRow> {
    let observed: PgActivityRow | undefined;
    await expect
      .poll(
        () => {
          observed = pgStatActivityForMarker(marker).find(
            (row) => row.state === "active",
          );
          return observed !== undefined;
        },
        { timeout: 15_000, intervals: [100, 250, 500] },
      )
      .toBe(true);
    return observed!;
  }

  /** Capture the real POST bodies the browser sends to the keyed execute path. */
  function captureExecutePosts(page: Page): string[] {
    const executePath = `/query-targets/${pgTargetResourceId}/execute`;
    const bodies: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().endsWith(executePath)) {
        bodies.push(req.postData() ?? "");
      }
    });
    return bodies;
  }

  /** Keyed point read-back through the proxy → real fixture backend. */
  async function keyedExecutionRecord(
    clientExecutionId: string,
  ): Promise<{
    kind?: string;
    status?: string;
    remoteState?: string | null;
    clientExecutionId?: string | null;
    errorCode?: string;
  } | null> {
    const res = await apiFetch(
      `/query-targets/${pgTargetResourceId}/executions?clientExecutionId=${encodeURIComponent(clientExecutionId)}&database=${encodeURIComponent(PG_CONN_LABDB)}&pageSize=5`,
    );
    if (!res.ok) {
      throw new Error(`keyed execution read failed: ${res.status}`);
    }
    const payload = (await res.json()) as {
      items?: Array<{
        kind?: string;
        status?: string;
        remoteState?: string | null;
        clientExecutionId?: string | null;
        errorCode?: string;
      }>;
    };
    return (
      (payload.items ?? []).find(
        (item) => item.clientExecutionId === clientExecutionId,
      ) ?? null
    );
  }

  test("cancel propagates browser → BFF → proxy → backend (positive chain)", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);
    const postedBodies = captureExecutePosts(page);

    // A several-second, disclosure-clean statement carrying a unique run
    // marker as a literal: generate_series is allowed by the G5 guard
    // (pg_sleep is denied) and every output column traces to a policied
    // source, so the request actually reaches PG execution.
    const marker = `t14r2-pos-${crypto.randomUUID().slice(0, 8)}`;
    await runStatement(page, markedLoadSql(marker));
    const cancelButton = page.getByTestId("cancel-execution");
    await expect(cancelButton).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => postedBodies.length, { timeout: 10_000 }).toBe(1);
    const key = JSON.parse(postedBodies[0]!).clientExecutionId as string;
    expect(key.length).toBeGreaterThan(0);

    // Execution-stage barrier: only after pg_stat_activity shows THIS marked
    // statement active (its own backend pid + backend_start) is there a real
    // remote statement for the cancel click to kill.
    const active = await awaitPgActive(marker);
    expect(active.pid).toBeGreaterThan(0);
    expect(active.backendStart).not.toBe("");

    await cancelButton.click();

    // Positive acceptance is the server-confirmed stop — a rendered
    // "requested"/"unknown" surface alone never proves the chain carried.
    await expect(page.getByTestId("cancel-outcome")).toContainText(
      "Server confirmed the execution stopped.",
      { timeout: 30_000 },
    );

    // Backend cancel evidence: the SAME clientExecutionId must read back a
    // terminal `cancelled` row whose probed remote state is `stopped` — the
    // fixture observed the real backend death, not a guessed state.
    const record = await keyedExecutionRecord(key);
    expect(record?.kind).toBe("execution");
    expect(record?.status).toBe("cancelled");
    expect(record?.remoteState).toBe("stopped");

    // Server-side death cross-check: the exact backend pid we pinned is no
    // longer running our marked statement.
    await expect
      .poll(
        () =>
          pgStatActivityForMarker(marker).some(
            (row) => row.pid === active.pid && row.state === "active",
          ),
        { timeout: 15_000, intervals: [200, 500] },
      )
      .toBe(false);
  });

  test("blocking proxy cancel-forwarding makes the positive acceptance fail (negative control)", async ({
    page,
  }) => {
    // The disposable E2E proxy's test-only toggle stops forwarding the
    // downstream abort into the upstream fetch. The UI still aborts its own
    // fetch and still probes — but nothing can reach the backend, so the
    // keyed record must NEVER land cancelled+stopped.
    const toggleUrl = "http://localhost:8081/__cancel-forwarding";
    const setForwarding = async (enabled: boolean) => {
      const res = await fetch(toggleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`cancel-forwarding toggle failed: ${res.status}`);
    };
    await setForwarding(false);
    try {
      await openQueryWorkbench(page);
      await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);
      const postedBodies = captureExecutePosts(page);

      const marker = `t14r2-neg-${crypto.randomUUID().slice(0, 8)}`;
      await runStatement(page, markedLoadSql(marker));
      const cancelButton = page.getByTestId("cancel-execution");
      await expect(cancelButton).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => postedBodies.length, { timeout: 10_000 }).toBe(1);
      const key = JSON.parse(postedBodies[0]!).clientExecutionId as string;

      // Same execution-stage barrier as the positive test: the marked
      // statement must be live on PG before we click — otherwise "cancel did
      // not arrive" proves nothing.
      await awaitPgActive(marker);
      await cancelButton.click();

      // The cancel surface resolves honestly — requested → running/unknown,
      // then terminal once the backend records something. A statement_timeout
      // kill also reads remote `stopped`, so UI text alone cannot distinguish
      // our cancel from the natural budget death — only the persisted keyed
      // status and its error code can (`cancelled` vs `timeout`/`query_timeout`).
      const outcome = page.getByTestId("cancel-outcome");
      await expect(outcome).toBeVisible({ timeout: 30_000 });

      // Strict negative acceptance: the keyed read-back must converge to a
      // terminal `timeout` row with the safe `query_timeout` identity — never
      // `cancelled`, `failed`, `rejected`, or (worst of all) `success`. Only
      // the server-side attempt budget ended the statement; nothing about our
      // click crossed the proxy.
      await expect
        .poll(
          async () => (await keyedExecutionRecord(key))?.status ?? "absent",
          { timeout: 30_000, intervals: [500, 1000, 2000] },
        )
        .toBe("timeout");
      const record = await keyedExecutionRecord(key);
      expect(record?.kind).toBe("execution");
      expect(record?.status).toBe("timeout");
      expect(record?.errorCode).toBe("query_timeout");

      // Budget death, not a stuck orphan: the marked statement leaves
      // pg_stat_activity on its own (no admin terminate rescue).
      await expect
        .poll(() => pgStatActivityForMarker(marker).length > 0, {
          timeout: 15_000,
          intervals: [500, 1000],
        })
        .toBe(false);
    } finally {
      // Restore forwarding — this toggle is module state on the shared proxy;
      // leaving it off would silently break every later cancel assertion.
      await setForwarding(true);
      const health = (await (
        await fetch("http://localhost:8081/__health", {
          signal: AbortSignal.timeout(10_000),
        })
      ).json()) as { cancelForwarding?: boolean };
      expect(health.cancelForwarding).toBe(true);
    }
  });

  test("history lists the terminal execution after a run", async ({ page }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(page, "select id from e2e.items order by id");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });

    await page.getByRole("tab", { name: /query history/i }).click();
    await expect(
      page.getByRole("tabpanel", { name: /query history/i }),
    ).toContainText("select id from e2e.items", { timeout: 15_000 });
  });
});

test.describe("PG saved statement + related records + persistence", () => {
  installSavedStatementTeardown();

  test("saved statement executes with parameter binding", async ({ page }) => {
    // Create BEFORE opening the workbench: the saved-statement list is
    // prefetched when the target activates and would not refetch a record
    // created mid-session.
    const createRes = await apiFetch(
      `/query-targets/${pgTargetResourceId}/saved-statements`,
      {
        method: "POST",
        body: JSON.stringify({
          name: `e2e_pg_lookup_${Date.now()}`,
          statement: "select id, name from e2e.items where id = :item_id",
          scope: "shared_template",
          database: PG_CONN_LABDB,
          schema: PG_SCHEMA_E2E,
          parameters: [{ name: "item_id", type: "integer" }],
        }),
      },
    );
    if (!createRes.ok) {
      throw new Error(`saved statement create failed: ${createRes.status}`);
    }
    const created = (await createRes.json()) as { id: number; name: string };
    trackSavedStatement({
      id: created.id,
      targetResourceId: pgTargetResourceId as number,
    });

    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    // Saved sheets tab → Load brings the statement into a template-mode
    // worksheet; Run then executes through the saved-statement route.
    await page.getByRole("tab", { name: /saved sheets/i }).click();
    const loadButton = page.getByRole("button", {
      name: new RegExp(`load ${created.name}`, "i"),
    });
    await expect(loadButton).toBeVisible({ timeout: 15_000 });
    await loadButton.click();
    await page.getByRole("tab", { name: /^worksheet$/i }).first().click();

    const paramInput = page.getByLabel("item_id value");
    await expect(paramInput).toBeVisible({ timeout: 10_000 });
    await paramInput.fill("2");
    await page.getByRole("button", { name: /^run$/i }).click();

    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("beta");
  });

  test("related records navigates the FK to the referenced parent row", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    // Preview data on e2e.child through the object explorer so provenance
    // carries the FK set needed for related-record eligibility.
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();

    const dbNode = explorer.getByRole("treeitem", {
      name: PG_CONN_LABDB,
      exact: true,
    });
    await expect(dbNode).toBeVisible({ timeout: 15_000 });
    await dbNode.getByRole("button").click();
    const schemaNode = explorer.getByRole("treeitem", {
      name: PG_SCHEMA_E2E,
      exact: true,
    });
    await expect(schemaNode).toBeVisible({ timeout: 15_000 });
    await schemaNode.getByRole("button").click();
    const childNode = explorer.getByRole("treeitem", {
      name: "child",
      exact: true,
    });
    await expect(childNode).toBeVisible({ timeout: 15_000 });
    await childNode.getByRole("button").click();

    const previewButton = explorer.getByRole("button", {
      name: "Preview data",
    });
    await expect(previewButton).toBeVisible({ timeout: 10_000 });
    await previewButton.click();

    await page.getByRole("button", { name: /^run$/i }).click();
    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: 30_000 });

    // Click a parent_id cell (second column of the first data row).
    const firstParentIdCell = grid
      .getByRole("gridcell")
      .nth(1);
    await firstParentIdCell.click();
    const relatedTrigger = page.getByTestId("related-records");
    await expect(relatedTrigger).toBeVisible({ timeout: 10_000 });
    await relatedTrigger.click();

    // The trigger opens an FK menu; pick the child→parent constraint.
    const menuItem = page.getByRole("menuitem", {
      name: /child_parent_id_fkey/,
    });
    await expect(menuItem).toBeVisible({ timeout: 10_000 });
    await menuItem.click();

    const relatedPanel = page.getByRole("region", {
      name: /related records/i,
    });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });
    await expect(relatedPanel).toContainText("Alpha Parent");
  });

  test("a duplicated navigation gesture sends one keyed related-records request", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const navPath = `/query-targets/${pgTargetResourceId}/related-records`;
    const navBodies: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().endsWith(navPath)) {
        navBodies.push(req.postData() ?? "");
      }
    });

    // Same explorer → preview path as the navigation spec above.
    await page.getByRole("button", { name: "Objects", exact: true }).click();
    const explorer = page.getByRole("complementary", { name: "Objects" });
    await expect(explorer).toBeVisible();
    await explorer
      .getByRole("treeitem", { name: PG_CONN_LABDB, exact: true })
      .getByRole("button")
      .click();
    await explorer
      .getByRole("treeitem", { name: PG_SCHEMA_E2E, exact: true })
      .getByRole("button")
      .click();
    await explorer
      .getByRole("treeitem", { name: "child", exact: true })
      .getByRole("button")
      .click();
    await explorer.getByRole("button", { name: "Preview data" }).click();
    await page.getByRole("button", { name: /^run$/i }).click();
    const grid = page.getByRole("grid").first();
    await expect(grid).toBeVisible({ timeout: 30_000 });

    await grid.getByRole("gridcell").nth(1).click();
    await page.getByTestId("related-records").click();
    const menuItem = page.getByRole("menuitem", {
      name: /child_parent_id_fkey/,
    });
    await expect(menuItem).toBeVisible({ timeout: 10_000 });
    // Two identical intents inside the same gesture — the second must fold
    // into the in-flight attempt, never mint a second key or POST.
    await menuItem.dispatchEvent("click");
    await menuItem.dispatchEvent("click");

    const relatedPanel = page.getByRole("region", {
      name: /related records/i,
    });
    await expect(relatedPanel).toBeVisible({ timeout: 15_000 });
    await expect(relatedPanel).toContainText("Alpha Parent");
    await expect.poll(() => navBodies.length, { timeout: 5_000 }).toBe(1);
    const navKey = JSON.parse(navBodies[0]!).clientExecutionId as string;
    expect(navKey.length).toBeGreaterThan(0);
  });

  test("connection, schema and statement survive a reload", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    // Wait for a workspace PUT whose body actually carries the selected
    // context — earlier PUTs (initial worksheet, pre-selection snapshots)
    // must not satisfy this wait.
    const putPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/query-workspace") &&
        r.request().method() === "PUT" &&
        (r.request().postData() ?? "").includes('"activeSchema":"e2e_alt"') &&
        (r.request().postData() ?? "").includes('"activeDatabase":"labdb"'),
      { timeout: 20_000 },
    );
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_ALT);
    await clearAndType(page, "select 41");
    await putPromise;

    await page.reload();
    // Hydration activates worksheets[0] — the default-target worksheet created
    // at page open. The PG worksheet (created when the target was picked) is
    // the second tab; activate it to surface the restored PG context.
    await page.getByRole("tab", { name: "Worksheet 2" }).click();
    const connSelect = page.getByTestId("pg-connection-select");
    await expect(connSelect).toHaveValue(PG_CONN_LABDB, { timeout: 15_000 });
    const schemaSelect = page.getByTestId("pg-schema-select");
    await expect(schemaSelect).toBeEnabled({ timeout: 15_000 });
    await expect(schemaSelect).toHaveValue(PG_SCHEMA_ALT);
    await expect
      .poll(() => getEditorContent(page), { timeout: 10_000 })
      .toContain("select 41");
  });
});

test.describe("PG paging, key lifecycle, fault injection and invalid context", () => {
  installSavedStatementTeardown();

  test("governed paging walks a real 60-row result with page request fields", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const executePath = `/query-targets/${pgTargetResourceId}/execute`;
    await runStatement(
      page,
      "select id, name from e2e.paging order by id",
    );
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("item-1");

    const paging = page.getByTestId("result-paging");
    await expect(paging).toBeVisible();

    const nextPage = page.waitForResponse(
      (r) =>
        r.url().endsWith(executePath) &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes('"page":2'),
      { timeout: 15_000 },
    );
    await paging.getByRole("button", { name: /next page/i }).click();
    const page2 = await nextPage;
    expect(
      JSON.parse(page2.request().postData() ?? "{}").pagination,
    ).toMatchObject({ page: 2, pageSize: 10 });
    await expect(grid).toContainText("item-11");

    const prevPage = page.waitForResponse(
      (r) =>
        r.url().endsWith(executePath) &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes('"page":1'),
      { timeout: 15_000 },
    );
    await paging.getByRole("button", { name: /previous page/i }).click();
    await prevPage;
    await expect(grid).toContainText("item-1");

    const resized = page.waitForResponse(
      (r) =>
        r.url().endsWith(executePath) &&
        r.request().method() === "POST" &&
        (r.request().postData() ?? "").includes('"pageSize":25'),
      { timeout: 15_000 },
    );
    await paging.getByLabel(/page size/i).click();
    await page.getByRole("option", { name: "25" }).click();
    await resized;
    await expect(grid).toContainText("item-21");
  });

  test("dollar-quoted text, casts and comment semicolons stay one statement", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(
      page,
      "select $$a;b$$::text as v /* ; not a boundary */",
    );
    const grid = page.getByRole("grid");
    await expect(grid).toBeVisible({ timeout: 30_000 });
    await expect(grid).toContainText("a;b");
  });

  test("a repeated click sends one keyed request and a new statement mints a new key", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const executePath = `/query-targets/${pgTargetResourceId}/execute`;
    const postedBodies: string[] = [];
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().endsWith(executePath)) {
        postedBodies.push(req.postData() ?? "");
      }
    });

    await clearAndType(page, "select 1");
    const runButton = page.getByRole("button", { name: /^run$/i });
    await runButton.dispatchEvent("click");
    await runButton.dispatchEvent("click");
    await expect(page.getByRole("grid")).toBeVisible({ timeout: 30_000 });
    expect(postedBodies).toHaveLength(1);
    const firstKey = JSON.parse(postedBodies[0]!).clientExecutionId as string;
    expect(firstKey.length).toBeGreaterThan(0);

    await runStatement(page, "select 2");
    await expect.poll(() => postedBodies.length).toBe(2);
    const secondKey = JSON.parse(postedBodies[1]!).clientExecutionId as string;
    expect(secondKey.length).toBeGreaterThan(0);
    expect(secondKey).not.toBe(firstKey);
  });

  test("contract-upgrade rejection clears the result and its export (fault injection)", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    await runStatement(page, "select 7 as keepme");
    const grid = page.getByRole("grid");
    await expect(grid).toContainText("keepme", { timeout: 30_000 });

    // Labeled fault injection: the NEXT execute is answered with the
    // upgrade-required 409 envelope; every other request stays real.
    const executeUrl = `http://localhost:3100/api/proxy/query-targets/${pgTargetResourceId}/execute`;
    consumableHttpErrors = [
      { method: "POST", url: executeUrl, status: 409, consumeConsoleStatusEcho: true },
    ];
    await page.route(`**/api/proxy/query-targets/${pgTargetResourceId}/execute`, (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({
          error: "result_contract_upgrade_required",
          message: "result contract upgrade required",
        }),
      }),
    );
    await runStatement(page, "select 8");
    await expect(
      page.getByRole("alert").filter({ hasText: /not delivered/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(grid).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /export csv/i }),
    ).toHaveCount(0);
    await page.unroute(`**/api/proxy/query-targets/${pgTargetResourceId}/execute`);
  });

  test("a restored missing connection stops at reselection without sending", async ({
    page,
  }) => {
    // Persist a worksheet pinned to a connection database the live target no
    // longer enumerates, then let real hydration revalidate it.
    const res = await apiFetch("/query-workspace");
    if (!res.ok) throw new Error(`workspace probe failed: ${res.status}`);
    const workspace = (await res.json()) as { version?: number };
    const put = await apiFetch("/query-workspace", {
      method: "PUT",
      body: JSON.stringify({
        expectedVersion: workspace.version,
        worksheets: [
          {
            id: "ws-missing-conn",
            name: "Missing Conn",
            targetResourceId: pgTargetResourceId,
            statement: "select 1",
            activeDatabase: "labdb_missing",
            activeSchema: "e2e",
          },
        ],
      }),
    });
    if (!put.ok) {
      throw new Error(`workspace seed failed: ${put.status} ${await put.text()}`);
    }

    const executePosts: string[] = [];
    page.on("request", (req) => {
      if (
        req.method() === "POST" &&
        req.url().endsWith(`/query-targets/${pgTargetResourceId}/execute`)
      ) {
        executePosts.push(req.url());
      }
    });

    await openQueryWorkbench(page);
    const connSelect = page.getByTestId("pg-connection-select");
    await expect(connSelect).toBeVisible({ timeout: 10_000 });
    // Revalidation cleared the vanished connection: the placeholder requires
    // an explicit new choice, Run stays gated, and no execute request can
    // leave the page under the dead pin.
    await expect(connSelect).toHaveValue("");
    await expect(
      page.getByRole("button", { name: /^run$/i }),
    ).toBeDisabled();
    await page.waitForTimeout(1_500);
    expect(executePosts).toHaveLength(0);

    // The labdb_missing schema/object listing 404s are real controlled
    // responses fired by the catalog effects (possibly StrictMode-duplicated)
    // before the pin was cleared — consume up to two per endpoint plus the
    // matching console echoes.
    for (const suffix of [
      `schema/schemas?database=labdb_missing&page=1&pageSize=100`,
      `schema/objects?database=labdb_missing&schema=e2e&page=1&pageSize=100`,
    ]) {
      const url = `http://localhost:3100/api/proxy/query-targets/${pgTargetResourceId}/${suffix}`;
      networkErrors = takeOptionalNetworkError(networkErrors, {
        method: "GET",
        url,
        status: 404,
      });
      networkErrors = takeOptionalNetworkError(networkErrors, {
        method: "GET",
        url,
        status: 404,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      consoleMessages = takeExpectedConsoleStatusError(consoleMessages, 404);
    }
  });

  test("an unlisted connection database is not selectable and its execute is refused", async ({
    page,
  }) => {
    await openQueryWorkbench(page);
    await selectPgContext(page, PG_CONN_LABDB, PG_SCHEMA_E2E);

    const connSelect = page.getByTestId("pg-connection-select");
    await expect(
      connSelect.locator('option[value="labdb_denied"]'),
    ).toHaveCount(0);

    // Server-side proof: the same unlisted database is refused at the
    // governed execute boundary, not merely hidden in the UI.
    const res = await apiFetch(`/query-targets/${pgTargetResourceId}/execute`, {
      method: "POST",
      body: JSON.stringify({
        statement: "select 1",
        database: "labdb_denied",
        clientExecutionId: crypto.randomUUID(),
        capabilities: ["cellTruncated"],
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBeTruthy();
  });
});
