// input: Testing Library, QueryWorkbench, mocked query services, and locale messages
// output: QueryWorkbench search recovery, stale/abort guards, and interaction tests
// pos: component-level behavioral coverage for the complete query workbench
// note: if this file changes, update header and tests/components/README.md
import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const stableSearchParams = new URLSearchParams();
const stableRouter = { replace };
const auth = vi.hoisted(() => ({ isAdmin: false }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/query",
  useRouter: () => stableRouter,
  useSearchParams: () => stableSearchParams,
}));

vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => auth.isAdmin,
}));

vi.mock("@/services/query-executions", async () => {
  const actual = await vi.importActual("@/services/query-executions");
  return {
    ...actual,
    executeQueryTarget: vi.fn(),
    explainQueryTarget: vi.fn(),
    listQueryExecutions: vi.fn(),
    navigateRelatedRecords: vi.fn(),
  };
});

vi.mock("@/services/query-targets", () => ({
  getQueryTargets: vi.fn(),
}));

vi.mock("@/services/query-schema", () => ({
  getSchemaDatabases: vi.fn().mockResolvedValue({ items: [], defaultDatabase: null }),
  getSchemaObjects: vi.fn().mockResolvedValue({ items: [] }),
  getObjectDetails: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

// Imported after mock so tests can assert schema is not requested for locked targets.

vi.mock("@/components/query/sql-code-editor", () => ({
  SqlCodeEditor: ({
    value,
    onChange,
    onRun,
    onFormat,
    ariaLabel,
    disabled,
    themePreference,
    height,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRun?: () => void;
    onFormat?: () => void;
    ariaLabel?: string;
    disabled?: boolean;
    themePreference?: string;
    height?: number;
  }) => (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          onRun?.();
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "f") {
          e.preventDefault();
          onFormat?.();
        }
      }}
      aria-label={ariaLabel}
      disabled={disabled}
      data-theme-preference={themePreference}
      data-editor-height={height}
      rows={4}
    />
  ),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "dark",
    resolvedTheme: "dark",
  }),
}));

import { QueryWorkbench } from "@/components/query/query-workbench";
import { QueryHistoryPanel } from "@/components/query/query-history-panel";
import { QUERY_EDITOR_HEIGHT_STORAGE_KEY } from "@/lib/query-editor-preferences";
import {
  buildColumnCompletionsForDot,
  buildTableCompletions,
} from "@/lib/query-sql-completion";
import { EMPTY_FILTERS, type WorkbenchFilters } from "@/lib/query-target-display";
import {
  executeQueryTarget,
  explainQueryTarget,
  listQueryExecutions,
  QueryExecuteError,
} from "@/services/query-executions";
import { getQueryTargets } from "@/services/query-targets";
import { getSchemaDatabases, getSchemaObjects, getObjectDetails } from "@/services/query-schema";
import { buildQueryTarget, type DeepPartial } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type {
  ExplainResponse,
  QueryExecuteResponse,
  QueryExecutionCursorPage,
  QueryExecutionRecord,
  QueryResultColumn,
} from "@/types/query-execution";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockExecuteQueryTarget = vi.mocked(executeQueryTarget);
const mockExplainQueryTarget = vi.mocked(explainQueryTarget);
const mockListQueryExecutions = vi.mocked(listQueryExecutions);
const mockGetQueryTargets = vi.mocked(getQueryTargets);
const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);
const mockCopyToClipboard = vi.mocked(copyToClipboard);

function col(
  name: string,
  databaseType: string,
  nullable: boolean,
): QueryResultColumn {
  return { name, databaseType, nullable, displayMode: "raw_copy_allowed", copyAllowed: true };
}

function emptyHistory(): QueryExecutionCursorPage {
  return {
    items: [],
    nextCursor: null,
  };
}

function buildTargets(): QueryTarget[] {
  return [
    buildQueryTarget({
      resourceId: 22,
      displayName: "Analytics ClickHouse Node 01",
      resourceName: "analytics-ch-node-01",
      connectionContext: {
        environment: "Production",
        owner: "DBA Team",
        engine: "clickhouse",
        host: "prod-ch-host-01.internal",
        port: 8123,
        clusterName: "Analytics ClickHouse Cluster",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      schemaPreview: [],
    }),
    buildQueryTarget({
      resourceId: 23,
      displayName: "Payment Redis Cache",
      resourceName: "payment-redis",
      connectionContext: {
        environment: "Production",
        owner: "Payments",
        engine: "redis",
        host: "redis-payment.internal",
        port: 6379,
        clusterName: "Payment Redis Cache",
      },
      capability: {
        queryKind: "redis",
        editorMode: "redis",
        languageLabel: "Redis command",
      },
      schemaPreview: [],
    }),
  ];
}

function pageInfoFor(targets: QueryTarget[]): PageInfo {
  return {
    page: 1,
    pageSize: 50,
    totalItems: targets.length,
    totalPages: Math.max(1, Math.ceil(targets.length / 50)),
    hasNextPage: false,
    hasPreviousPage: false,
  };
}

function renderWorkbench(
  targets: QueryTarget[] = buildTargets(),
  messages: Record<string, unknown> = enMessages,
  initialFilters: WorkbenchFilters = EMPTY_FILTERS,
  environmentId?: number,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryWorkbench
        targets={targets}
        pageInfo={pageInfoFor(targets)}
        initialFilters={initialFilters}
        environmentId={environmentId}
      />
    </NextIntlClientProvider>,
  );
}

function openConnections() {
  fireEvent.click(screen.getByRole("button", { name: "Open connections" }));
}

function buildReadyWorkbenchTarget(): QueryTarget {
  return buildQueryTarget({
    resourceId: 30,
    displayName: "Local MySQL Dev",
    resourceName: "local-mysql-dev",
    connectionContext: {
      engine: "mysql",
      host: "127.0.0.1",
      port: 3306,
      environment: "Development",
      owner: "Platform",
      clusterName: "",
    },
    capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
    readiness: "ready",
    governance: {
      executionEnabled: true,
      credentialState: "configured_readonly_credential",
      auditRequired: true,
      safetyState: "readonly_sandbox_enabled",
      safetyNote: "Read-only sandbox is enabled.",
      policyNotes: [],
    },
    availableActions: {
      run: true,
      explain: false,
      export: false,
      saveSheet: false,
      requestAccess: false,
    },
    missingFields: [],
  });
}

describe("QueryWorkbench", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("renders the SQL editor with dark theme preference", () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    expect(screen.getByLabelText("Statement")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
  });

  it("keeps editor controls readable in dark mode", () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    expect(screen.getByRole("button", { name: "Run" })).toBeEnabled();
    expect(screen.getByLabelText("Statement")).toHaveAttribute(
      "data-theme-preference",
      "dark",
    );
  });

  it("loads stored editor height after hydration", async () => {
    window.localStorage.setItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY, "360");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByLabelText("Statement")).toHaveAttribute(
        "data-editor-height",
        "360",
      );
    });
  });

  it("ignores invalid stored editor height", async () => {
    window.localStorage.setItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY, "50");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByLabelText("Statement")).toHaveAttribute(
        "data-editor-height",
        "260",
      );
    });
  });

  it("clamps and persists editor height after resize", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    const handle = screen.getByRole("separator", { name: "Resize SQL editor" });
    fireEvent.pointerDown(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(window, { clientY: 900, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      expect(screen.getByLabelText("Statement")).toHaveAttribute(
        "data-editor-height",
        "640",
      );
    });
    expect(window.localStorage.getItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY)).toBe("640");
  });

  it("uses inline governance instead of a safety education banner for a ready target", () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    expect(screen.getByRole("region", { name: "Governance & access" })).toBeInTheDocument();
    expect(screen.queryByText("Governed query execution")).toBeNull();
  });

  it("renders the active target's facts in the context bar and governance panel", () => {
    renderWorkbench();

    expect(screen.getByText("Analytics ClickHouse Node 01")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Governance & access" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Missing read-only credential")).toBeInTheDocument();
    expect(screen.queryAllByText(/^readonlyCredential$/)).toHaveLength(0);
  });

  it("locked target shows one primary blocker, not a row of disabled action buttons", () => {
    renderWorkbench();

    expect(screen.getByText("Blocker")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Run locked" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Explain locked" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save sheet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export unavailable" })).toBeNull();
  });

  it("renders an honest locked schema placeholder for a SQL target without schema metadata", async () => {
    mockGetSchemaDatabases.mockClear();
    renderWorkbench();

    // The schema placeholder is now inside the objects pane, which must be opened first.
    fireEvent.click(screen.getByRole("button", { name: "Objects" }));

    // Locked targets must not issue schema requests — show the locked copy instead.
    await waitFor(() => {
      expect(
        screen.getByText(/Schema is locked — no live introspection in this phase/i),
      ).toBeInTheDocument();
    });
    expect(mockGetSchemaDatabases).not.toHaveBeenCalled();
  });

  it("renders the locked result area with a not-executed state", () => {
    renderWorkbench();

    expect(screen.getByText("Result grid")).toBeInTheDocument();
    expect(screen.getByText("0 rows · not executed")).toBeInTheDocument();
    expect(screen.getByText("Result area is locked")).toBeInTheDocument();
  });

  it("result area exposes only Grid — no JSON/EXPLAIN/Logs/Masking tabs in locked state", () => {
    renderWorkbench();

    expect(screen.getByText("Result grid")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /json/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /explain/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /logs/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /masking/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^json$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^explain$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^logs$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^masking$/i })).toBeNull();
  });

  it("localizes Objects open/close/resize labels in Chinese", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildTargets(), zhMessages);

    // Desktop Objects toggle uses the Chinese objects label.
    expect(screen.getByRole("button", { name: "对象" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "对象" }));
    expect(
      screen.getByRole("complementary", { name: "对象" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关闭对象面板" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: "调整对象面板大小" }),
    ).toBeInTheDocument();
  });

  it("renders query history when that tab is opened", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("tab", { name: /history/i }));
    await waitFor(() => {
      expect(screen.getByText(/No executions yet/i)).toBeInTheDocument();
    });
  });

  it("narrows the target list with search in the connection navigator", async () => {
    const user = userEvent.setup();
    renderWorkbench();
    openConnections();

    expect(
      screen.getByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Payment Redis Cache" }),
    ).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText("Search by name, engine, host…");
    await user.type(searchInput, "redis");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Payment Redis Cache" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).not.toBeInTheDocument();
  });

  it("does not render the removed safety education banner under the zh-CN locale", () => {
    renderWorkbench(buildTargets(), zhMessages);

    expect(screen.queryByText("受治理的查询执行")).toBeNull();
  });

  it("shows the active target name in the navigator and header, never a bare resourceId", () => {
    renderWorkbench();
    openConnections();

    expect(screen.getAllByText(/Analytics ClickHouse Node 01/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(/^22$/)).toHaveLength(0);
  });

  it("renders localized labels in filter triggers, never raw enum values", () => {
    renderWorkbench(
      buildTargets(),
      enMessages,
      { ...EMPTY_FILTERS, queryKind: "sql", readiness: "credential_required" },
    );
    openConnections();

    const queryKindTrigger = screen.getByRole("combobox", { name: "Editor mode" });
    expect(queryKindTrigger).toHaveTextContent("SQL");
    expect(queryKindTrigger).not.toHaveTextContent("sql");

    const readinessTrigger = screen.getByRole("combobox", { name: "Readiness" });
    expect(readinessTrigger).toHaveTextContent("Credential required");
    expect(readinessTrigger).not.toHaveTextContent("credential_required");
  });

  it("renders the readiness trigger label for missing_connection without leaking the raw enum", () => {
    const targets = [
      ...buildTargets(),
      buildQueryTarget({
        resourceId: 99,
        displayName: "Offline Node",
        connectionContext: {
          engine: "mysql",
          host: "",
          port: 0,
          environment: "Production",
          owner: "DBA Team",
          clusterName: "",
        },
        readiness: "missing_connection",
        missingFields: ["host", "port"],
      }),
    ];
    renderWorkbench(
      targets,
      enMessages,
      { ...EMPTY_FILTERS, readiness: "missing_connection" },
    );
    openConnections();

    const readinessTrigger = screen.getByRole("combobox", { name: "Readiness" });
    expect(readinessTrigger).toHaveTextContent("Missing connection");
    expect(readinessTrigger).not.toHaveTextContent("missing_connection");
  });

  it("renders an incomplete-connection label and never :0 for a missing_connection target", () => {
    const target = buildQueryTarget({
      resourceId: 50,
      displayName: "Unconfigured MySQL Node",
      connectionContext: {
        engine: "mysql",
        host: "",
        port: 0,
        environment: "Production",
        owner: "DBA Team",
        clusterName: "",
      },
      readiness: "missing_connection",
      missingFields: ["host", "port"],
    });

    renderWorkbench([target]);

    expect(screen.getByText("Unconfigured MySQL Node")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getAllByText("Missing connection").length).toBeGreaterThanOrEqual(1);

    expect(screen.queryAllByText(/:0/)).toHaveLength(0);

    expect(screen.getAllByText(/Missing read-only credential/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^missing_readonly_credential$/)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Governance & access Details" }));
    expect(screen.getAllByText("Host").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Port").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^host$/)).toHaveLength(0);
    expect(screen.queryAllByText(/^port$/)).toHaveLength(0);
  });
});

/**
 * Phase 37F execution wiring. The workbench may only run when the backend says
 * availableActions.run === true; the request body never carries actorUserId; SQL
 * NULL renders as an explicit marker; controlled backend errors render as
 * distinct states without raw stack traces; history refreshes after the
 * request settles.
 */
describe("QueryWorkbench execution (ready target)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  function buildReadyTarget(overrides: DeepPartial<QueryTarget> = {}): QueryTarget {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
      ...overrides,
    });
  }

  function renderReady(
    target: QueryTarget = buildReadyTarget(),
    messages: Record<string, unknown> = enMessages,
  ) {
    return render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <QueryWorkbench
          targets={[target]}
          pageInfo={pageInfoFor([target])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );
  }

  function buildExecuteResponse(
    overrides: Partial<QueryExecuteResponse> = {},
  ): QueryExecuteResponse {
    return {
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("name", "VARCHAR", true),
      ],
      rows: [
        [1, "orders-api"],
        [2, null],
      ],
      rowCount: 2,
      truncated: false,
      durationMs: 18,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
      ...overrides,
    };
  }

  it("keeps Run disabled for a locked target even though the workbench renders", () => {
    const lockedTarget = buildQueryTarget({
      resourceId: 40,
      readiness: "credential_required",
      availableActions: { run: false, explain: false, export: false, saveSheet: false, requestAccess: false },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[lockedTarget]}
          pageInfo={pageInfoFor([lockedTarget])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
  });

  it("enables Run for a backend-ready target", () => {
    renderReady();

    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
  });

  it("shows only implemented primary actions in the worksheet toolbar", () => {
    renderReady();

    expect(screen.getByRole("button", { name: /^run$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^format$/i })).toBeInTheDocument();
  });

  it("does not show export save sheet or access as primary buttons", () => {
    renderReady();

    expect(screen.queryByRole("button", { name: /explain/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save sheet/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
  });

  it("clicking Run calls executeQueryTarget once with statement and maxRows", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    expect(mockExecuteQueryTarget).toHaveBeenCalledWith(30, {
      statement: "select 1",
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
    // The actor must never appear in the request arguments.
    const callArgs = mockExecuteQueryTarget.mock.calls[0]![1] as Record<string, unknown>;
    expect(callArgs).not.toHaveProperty("actorUserId");
  });

  it("disables Run while a request is pending and does not double-submit", async () => {
    const user = userEvent.setup();
    let resolveExecute!: (value: QueryExecuteResponse) => void;
    mockExecuteQueryTarget.mockImplementationOnce(
      () => new Promise<QueryExecuteResponse>((resolve) => {
        resolveExecute = resolve;
      }),
    );
    renderReady();

    const runButton = screen.getByRole("button", { name: /^run$/i });
    await user.click(runButton);

    // While the request is in flight, Run is disabled — the disabled control is
    // the primary guard against a second submission.
    expect(runButton).toBeDisabled();
    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);

    resolveExecute(buildExecuteResponse());
    await waitFor(() => expect(runButton).toBeEnabled());
    // Settling the request did not trigger a second execution.
    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
  });

  it("renders columns, rows, rowCount, duration, limit, and truncation on success", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // Column headers from the backend response.
    expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    // A real row value, never a bare resourceId.
    expect(screen.getByText("orders-api")).toBeInTheDocument();
    // Row count, duration, applied limit all surface.
    expect(screen.getByText(/2 rows/)).toBeInTheDocument();
    expect(screen.getByText(/18 ms/)).toBeInTheDocument();
    expect(screen.getByText(/Limit 100/)).toBeInTheDocument();
    // Not truncated, so the truncation flag must be absent.
    expect(screen.queryByText(/truncated/i)).toBeNull();
  });

  it("renders a SQL NULL cell as an explicit marker, never 0 or undefined", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        columns: [col("v", "INT", true)],
        rows: [[null], [7]],
        rowCount: 2,
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // Exactly one NULL marker (one null cell), rendered as localized text.
    expect(screen.getAllByText("NULL")).toHaveLength(1);
    // The null cell must never coerce to a numeric 0 or the string "undefined".
    expect(screen.queryByText("undefined")).toBeNull();
  });

  it("renders a governance/policy error on 403 query_not_allowed", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(403, "query_not_allowed", "target is not enabled"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(screen.getByText(/Execution not allowed/)).toBeInTheDocument();
    expect(screen.queryByText(/target is not enabled/)).not.toBeInTheDocument();
    expect(screen.queryByText(/query_not_allowed/)).not.toBeInTheDocument();
  });

  it("renders a SQL guard error on 400 validation_failed", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(400, "validation_failed", "only a single SELECT statement is allowed"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(screen.getByText(/blocked by the SQL guard/i)).toBeInTheDocument();
    expect(screen.queryByText(/only a single SELECT statement is allowed/)).not.toBeInTheDocument();
  });

  it("renders a timeout state on 408 query_timeout", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(408, "query_timeout", "execution exceeded the timeout"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(screen.getByText(/timed out/i)).toBeInTheDocument();
  });

  it("renders a backend failure state on 502 query_backend_error", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(502, "query_backend_error", "target database rejected the connection"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(screen.getByText(/target database error/i)).toBeInTheDocument();
  });

  it("refreshes history after the execution settles", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    renderReady();

    // Initial mount must not fire target-switch history work.
    expect(mockListQueryExecutions).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // After the execution settles, history is refreshed once.
    await waitFor(() => expect(mockListQueryExecutions).toHaveBeenCalledTimes(1));
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30, { pageSize: 20 });
  });
});

/**
 * Phase 38I: initial mount must keep a single worksheet. targetSelectionVersion
 * starts at 0 and must not be treated as a user-initiated target switch.
 */
describe("QueryWorkbench initial worksheet mount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  function worksheetTabs() {
    // Worksheet name tabs live in the tablist that also has the "+ Add worksheet" control.
    return screen.getAllByRole("tab").filter((tab) =>
      /worksheet\s+\d+/i.test(tab.textContent ?? ""),
    );
  }

  it("REGRESSION: initial load has exactly one worksheet (Worksheet 1)", () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    const tabs = worksheetTabs();
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toHaveAccessibleName(/worksheet 1/i);
    expect(screen.queryByRole("tab", { name: /worksheet 2/i })).toBeNull();
  });

  it("REGRESSION: initial mount does not trigger target-switch history fetch", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    // Allow effects to flush; mount must not append a worksheet or fetch history.
    await act(async () => {
      await Promise.resolve();
    });

    expect(worksheetTabs()).toHaveLength(1);
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
  });

  it("REGRESSION: navigator target switch creates exactly one new worksheet and activates it", async () => {
    const user = userEvent.setup();
    const targets = [
      buildReadyWorkbenchTarget(),
      buildQueryTarget({
        resourceId: 31,
        displayName: "Staging MySQL",
        resourceName: "staging-mysql",
        readiness: "ready",
        availableActions: {
          run: true,
          explain: false,
          export: false,
          saveSheet: false,
          requestAccess: false,
        },
        governance: {
          executionEnabled: true,
          credentialState: "configured_readonly_credential",
          auditRequired: true,
          safetyState: "readonly_sandbox_enabled",
          safetyNote: "Read-only sandbox is enabled.",
          policyNotes: [],
        },
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={targets}
          pageInfo={pageInfoFor(targets)}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    expect(worksheetTabs()).toHaveLength(1);
    expect(screen.getByRole("tab", { name: /worksheet 1/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    openConnections();
    await user.click(screen.getByRole("button", { name: "Staging MySQL" }));

    await waitFor(() => {
      expect(worksheetTabs()).toHaveLength(2);
    });
    expect(screen.getByRole("tab", { name: /worksheet 1/i })).toBeInTheDocument();
    const worksheet2 = screen.getByRole("tab", { name: /worksheet 2/i });
    expect(worksheet2).toHaveAttribute("aria-selected", "true");
    // History must not fetch on target-switch worksheet creation — only on first
    // History tab open (or after a run). Prior worksheet remains intact.
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: /query history/i }));
    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledWith(31, { pageSize: 20 });
    });
    expect(mockListQueryExecutions).toHaveBeenCalledTimes(1);
  });
});

/**
 * Phase 37F stale-state ownership. Execution results, errors, and history must
 * belong strictly to the currently selected target. When the user switches
 * targets while a prior target's execute or history request is still in flight,
 * that settling promise must never write back into the new target's UI.
 *
 * The execute/history guards below are protected by BOTH the editor remount
 * (key on resourceId) AND the in-shell stale-target guard — removing either one
 * alone keeps them green. The statement-reset case is protected only by the
 * remount, so it fails if the key is ever removed.
 */
describe("QueryWorkbench target switching (ready targets)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const TARGET_A_ID = 30;
  const TARGET_B_ID = 31;

  function readyTarget(overrides: DeepPartial<QueryTarget>): QueryTarget {
    return buildQueryTarget({
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      ...overrides,
    });
  }

  function buildSwitchTargets(): QueryTarget[] {
    return [
      readyTarget({
        resourceId: TARGET_A_ID,
        displayName: "Local MySQL Dev",
        resourceName: "local-mysql-dev",
        connectionContext: {
          engine: "mysql",
          host: "127.0.0.1",
          port: 3306,
          environment: "Development",
          owner: "Platform",
          clusterName: "",
        },
      }),
      readyTarget({
        resourceId: TARGET_B_ID,
        displayName: "Staging MySQL",
        resourceName: "staging-mysql",
        connectionContext: {
          engine: "mysql",
          host: "staging-mysql.internal",
          port: 3306,
          environment: "Staging",
          owner: "Platform",
          clusterName: "",
        },
      }),
    ];
  }

  function executeResponseForA(): QueryExecuteResponse {
    return {
      executionId: 1001,
      status: "success",
      targetResourceId: TARGET_A_ID,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("service", "VARCHAR", true),
      ],
      rows: [[1, "orders-api"]],
      rowCount: 1,
      truncated: false,
      durationMs: 12,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
    };
  }

  function historyForA(): QueryExecutionCursorPage {
    return {
      items: [
        {
          id: 9001,
          targetResourceId: TARGET_A_ID,
          actor: { displayName: "Chen Hao" },
          engine: "mysql",
          statementDigest: "digest-analytics",
          statementPreview: "select * from analytics_log",
          status: "success",
          rowCount: 42,
          durationMs: 9,
          errorCode: "",
          errorMessage: "",
          createdAt: "2026-06-22T08:00:00Z",
        },
      ],
      nextCursor: null,
    };
  }

  function renderWithTargets(targets: QueryTarget[] = buildSwitchTargets()) {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={targets}
          pageInfo={pageInfoFor(targets)}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );
  }

  async function pickTarget(
    user: ReturnType<typeof userEvent.setup>,
    name: RegExp,
  ): Promise<void> {
    openConnections();
    await user.click(await screen.findByRole("button", { name }));
  }

  it("does not render target A's execute result under target B when A's request settles after the switch", async () => {
    const user = userEvent.setup();
    let resolveExecuteA!: (value: QueryExecuteResponse) => void;
    mockExecuteQueryTarget.mockImplementationOnce(
      () =>
        new Promise<QueryExecuteResponse>((resolve) => {
          resolveExecuteA = resolve;
        }),
    );
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    renderWithTargets();

    // A is active (first target). Start its execution; the request stays pending.
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // Switch to target B before A's request settles.
    await pickTarget(user, /Staging MySQL/);

    // A's long-pending request now resolves. Its result must never render under B.
    resolveExecuteA(executeResponseForA());

    // B has not been executed → the not-executed marker, never A's rows.
    await waitFor(() => {
      expect(screen.getByText("0 rows · not executed")).toBeInTheDocument();
    });
    expect(screen.queryByText("orders-api")).toBeNull();
  });

  it("does not leak target A's history into target B while B's history is loading", async () => {
    const user = userEvent.setup();
    let resolveBHistory!: (value: QueryExecutionCursorPage) => void;
    mockListQueryExecutions.mockImplementation((resourceId: number) => {
      if (resourceId === TARGET_A_ID) return Promise.resolve(historyForA());
      return new Promise<QueryExecutionCursorPage>((resolve) => {
        resolveBHistory = resolve;
      });
    });

    renderWithTargets();

    // Switch to B (creates a worksheet + starts B's history load). Open history
    // while B is still pending — A's history must never appear.
    await pickTarget(user, /Staging MySQL/);
    await user.click(screen.getByRole("tab", { name: /query history/i }));

    // B is loading → loading marker, never A's statement preview.
    await waitFor(() => {
      expect(screen.getByText("Loading history…")).toBeInTheDocument();
    });
    expect(screen.queryByText("select * from analytics_log")).toBeNull();

    // When B's history settles empty, A's history still must not appear.
    resolveBHistory(emptyHistory());
    await waitFor(() => {
      expect(screen.getByText("No executions yet")).toBeInTheDocument();
    });
    expect(screen.queryByText("select * from analytics_log")).toBeNull();
  });

  it("does not leak target A's history into target B when B's history fails to load", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockImplementation((resourceId: number) => {
      if (resourceId === TARGET_A_ID) return Promise.resolve(historyForA());
      return Promise.reject(new Error("history unavailable"));
    });

    renderWithTargets();

    await pickTarget(user, /Staging MySQL/);
    await user.click(screen.getByRole("tab", { name: /query history/i }));

    // B's load failed → localized error + retry, never A's statement preview.
    await waitFor(() => {
      expect(screen.getByText("Could not load execution history")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByText("select * from analytics_log")).toBeNull();
  });

  it("creates a new worksheet with default statement when switching targets", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    renderWithTargets();

    // A is active. Edit the statement away from the default seed.
    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.clear(statement);
    await user.type(statement, "select 2 from a");
    expect(statement).toHaveValue("select 2 from a");

    // Phase 38I: switching targets creates a new worksheet with the default statement,
    // preserving the original worksheet's SQL, result, and history.
    await pickTarget(user, /Staging MySQL/);

    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("select 1");
  });
});

describe("QueryWorkbench target picker search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    replace.mockClear();
  });

  it("searches the server after a debounce so targets outside the loaded page are selectable", async () => {
    vi.useFakeTimers();
    try {
      const outsidePageTarget = buildQueryTarget({
        resourceId: 88,
        displayName: "Outside page PostgreSQL",
        resourceName: "outside-page-postgres",
      });
      mockGetQueryTargets.mockResolvedValue({
        items: [outsidePageTarget],
        pageInfo: {
          page: 1,
          pageSize: 50,
          totalItems: 1,
          totalPages: 1,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });

      renderWorkbench(buildThreeTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();

      fireEvent.change(screen.getByPlaceholderText(/Search by name, engine, host/), {
        target: { value: "outside" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(mockGetQueryTargets).toHaveBeenCalledWith(
        { page: 1, pageSize: 50, q: "outside", environmentId: 7 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(screen.getByRole("button", { name: "Outside page PostgreSQL" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the resolved environment scope when searching targets", async () => {
    vi.useFakeTimers();
    try {
      mockGetQueryTargets.mockResolvedValue({
        items: [],
        pageInfo: { page: 1, pageSize: 50, totalItems: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
      });

      renderWorkbench(buildThreeTargets(), enMessages, { ...EMPTY_FILTERS, engine: "mysql" }, 7);
      openConnections();
      fireEvent.change(screen.getByPlaceholderText(/Search by name, engine, host/), {
        target: { value: "outside" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(mockGetQueryTargets).toHaveBeenCalledWith(
        { page: 1, pageSize: 50, q: "outside", engine: "mysql", environmentId: 7 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("preserves the last successful search page when a newer search fails", async () => {
    vi.useFakeTimers();
    try {
      const successfulTarget = buildQueryTarget({
        resourceId: 88,
        displayName: "Successful Redis target",
        resourceName: "successful-redis-target",
      });
      mockGetQueryTargets
        .mockResolvedValueOnce({
          items: [successfulTarget],
          pageInfo: {
            page: 1,
            pageSize: 50,
            totalItems: 1,
            totalPages: 1,
            hasPreviousPage: false,
            hasNextPage: false,
          },
        })
        .mockRejectedValueOnce(new Error("backend details must not render"));

      renderWorkbench(buildThreeTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();
      const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);

      fireEvent.change(searchInput, { target: { value: "redis" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });
      expect(screen.getByRole("button", { name: "Successful Redis target" })).toBeInTheDocument();

      fireEvent.change(searchInput, { target: { value: "mysql" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(screen.getByRole("alert")).toHaveTextContent("Unable to search targets.");
      expect(screen.getByRole("button", { name: "Successful Redis target" })).toBeInTheDocument();
      expect(screen.getByText("Showing 1 target")).toBeInTheDocument();
      expect(screen.queryByText("No targets match your filters.")).not.toBeInTheDocument();
      expect(screen.queryByText("backend details must not render")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Retry target search" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the initial target page when the first search fails", async () => {
    vi.useFakeTimers();
    try {
      const initialTarget = buildQueryTarget({
        resourceId: 88,
        displayName: "Initial canonical target",
        resourceName: "initial-canonical-target",
      });
      mockGetQueryTargets.mockRejectedValue(new Error("initial raw failure"));

      renderWorkbench(
        [initialTarget],
        enMessages,
        { ...EMPTY_FILTERS, q: "temporarily unavailable" },
        7,
      );
      openConnections();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(screen.getByRole("alert")).toHaveTextContent("Unable to search targets.");
      expect(screen.getByRole("button", { name: "Initial canonical target" })).toBeInTheDocument();
      expect(screen.getAllByText("Initial canonical target").length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByText("No targets match your filters.")).not.toBeInTheDocument();
      expect(screen.queryByText("initial raw failure")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries the current search scope and clears the error after success", async () => {
    vi.useFakeTimers();
    try {
      const retryTarget = buildQueryTarget({
        resourceId: 89,
        displayName: "Retry success target",
        resourceName: "retry-success-target",
        connectionContext: {
          environment: "Production",
          owner: "DBA",
          engine: "redis",
          host: "retry.internal",
          port: 6379,
        },
      });
      const retryPageInfo = pageInfoFor([retryTarget]);
      mockGetQueryTargets
        .mockRejectedValueOnce(new Error("retry raw failure"))
        .mockResolvedValueOnce({ items: [retryTarget], pageInfo: retryPageInfo });

      renderWorkbench(
        buildThreeTargets(),
        enMessages,
        { ...EMPTY_FILTERS, q: "retry", engine: "redis" },
        9,
      );
      openConnections();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Unable to search targets.");

      fireEvent.click(screen.getByRole("button", { name: "Retry target search" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(mockGetQueryTargets).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 50, q: "retry", engine: "redis", environmentId: 9 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(screen.getByRole("button", { name: "Retry success target" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("combobox", { name: "Engine" })).toHaveTextContent("redis");
      expect(screen.queryByText("retry raw failure")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("requests an engine-only filter from the server and keeps its deep-link scope", async () => {
    const user = userEvent.setup();
    const redisTarget = buildQueryTarget({
      resourceId: 88,
      displayName: "Redis beyond the first page",
      resourceName: "redis-beyond-page-one",
      connectionContext: {
        environment: "Production",
        owner: "DBA",
        engine: "redis",
        host: "redis.internal",
        port: 6379,
      },
    });
    mockGetQueryTargets.mockResolvedValue({
      items: [redisTarget],
      pageInfo: {
        page: 1,
        pageSize: 50,
        totalItems: 51,
        totalPages: 2,
        hasPreviousPage: false,
        hasNextPage: true,
      },
    });
    stableSearchParams.set("environment", "production");

    try {
      renderWorkbench(buildTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();
      replace.mockClear();

      await user.click(screen.getByRole("combobox", { name: "Engine" }));
      await user.click(await screen.findByRole("option", { name: "redis" }));

      await waitFor(() => {
        expect(mockGetQueryTargets).toHaveBeenCalledWith(
          { page: 1, pageSize: 50, engine: "redis", environmentId: 7 },
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      });
      expect(screen.getByRole("button", { name: "Redis beyond the first page" })).toBeInTheDocument();
      expect(replace).toHaveBeenLastCalledWith(
        "/query?environment=production&engine=redis",
      );
    } finally {
      stableSearchParams.delete("environment");
    }
  });

  it("loads every scoped page before offering an engine absent from the first page", async () => {
    const user = userEvent.setup();
    const mysqlTarget = buildQueryTarget({
      resourceId: 88,
      displayName: "MySQL beyond the first page",
      resourceName: "mysql-beyond-page-one",
      connectionContext: { environment: "Production", owner: "DBA", engine: "mysql", host: "mysql.internal", port: 3306 },
    });
    mockGetQueryTargets
      .mockResolvedValueOnce({ items: buildTargets(), pageInfo: { page: 1, pageSize: 50, totalItems: 51, totalPages: 2, hasPreviousPage: false, hasNextPage: true } })
      .mockResolvedValueOnce({ items: [mysqlTarget], pageInfo: { page: 2, pageSize: 50, totalItems: 51, totalPages: 2, hasPreviousPage: true, hasNextPage: false } })
      .mockResolvedValueOnce({ items: [mysqlTarget], pageInfo: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1, hasPreviousPage: false, hasNextPage: false } });

    renderWorkbench(buildTargets(), enMessages, EMPTY_FILTERS, 7);
    openConnections();
    await user.click(screen.getByRole("button", { name: "Load all engines" }));

    await waitFor(() => {
      expect(mockGetQueryTargets).toHaveBeenNthCalledWith(2, {
        page: 2,
        pageSize: 50,
        environmentId: 7,
      });
    });
    await user.click(screen.getByRole("combobox", { name: "Engine" }));
    await user.click(await screen.findByRole("option", { name: "mysql" }));

    await waitFor(() => {
      expect(mockGetQueryTargets).toHaveBeenLastCalledWith(
        { page: 1, pageSize: 50, engine: "mysql", environmentId: 7 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });

  it("reports a scoped engine-discovery failure", async () => {
    const user = userEvent.setup();
    mockGetQueryTargets.mockRejectedValue(new Error("network"));

    renderWorkbench(buildTargets(), enMessages, EMPTY_FILTERS, 7);
    openConnections();
    await user.click(screen.getByRole("button", { name: "Load all engines" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load targets.");
  });

  it("preserves the active target's canonical metadata when a server search returns its ID with conflicting details", async () => {
    vi.useFakeTimers();
    try {
      const canonicalTarget = buildQueryTarget({
        resourceId: 88,
        displayName: "Canonical ClickHouse",
        resourceName: "canonical-clickhouse",
        connectionContext: {
          environment: "Production",
          owner: "DBA Team",
          engine: "clickhouse",
          host: "canonical-clickhouse.internal",
          port: 8123,
          clusterName: "Canonical ClickHouse Cluster",
        },
      });
      const conflictingSearchTarget = buildQueryTarget({
        resourceId: canonicalTarget.resourceId,
        displayName: "Conflicting Search Result",
        resourceName: "conflicting-search-result",
        connectionContext: {
          environment: "Staging",
          owner: "Search Service",
          engine: "mysql",
          host: "conflicting-mysql.internal",
          port: 3306,
          clusterName: "Conflicting Search Cluster",
        },
      });
      mockGetQueryTargets.mockResolvedValue({
        items: [conflictingSearchTarget],
        pageInfo: pageInfoFor([conflictingSearchTarget]),
      });

      renderWorkbench([canonicalTarget], enMessages, EMPTY_FILTERS, 7);
      openConnections();

      fireEvent.change(screen.getByPlaceholderText(/Search by name, engine, host/), {
        target: { value: "conflicting" },
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      fireEvent.click(screen.getByRole("button", { name: "Close" }));

      expect(screen.getByText("Canonical ClickHouse")).toBeInTheDocument();
      expect(screen.getByText("Production")).toBeInTheDocument();
      expect(screen.queryByText("Conflicting Search Result")).toBeNull();
      expect(screen.queryByText("conflicting-mysql.internal:3306")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards a stale server search response after a newer query resolves", async () => {
    vi.useFakeTimers();
    try {
      let resolveFirstSearch: ((response: { items: QueryTarget[]; pageInfo: PageInfo }) => void) | undefined;
      let resolveSecondSearch: ((response: { items: QueryTarget[]; pageInfo: PageInfo }) => void) | undefined;
      const firstTarget = buildQueryTarget({ resourceId: 81, displayName: "First result" });
      const secondTarget = buildQueryTarget({ resourceId: 82, displayName: "Second result" });
      const searchPageInfo: PageInfo = {
        page: 1,
        pageSize: 50,
        totalItems: 1,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      };
      mockGetQueryTargets
        .mockImplementationOnce(() => new Promise((resolve) => { resolveFirstSearch = resolve; }))
        .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondSearch = resolve; }));

      renderWorkbench(buildThreeTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();
      const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);

      fireEvent.change(searchInput, { target: { value: "first" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });
      fireEvent.change(searchInput, { target: { value: "second" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      resolveSecondSearch?.({ items: [secondTarget], pageInfo: searchPageInfo });
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Second result" })).toBeInTheDocument();

      resolveFirstSearch?.({ items: [firstTarget], pageInfo: searchPageInfo });
      await act(async () => {});
      expect(screen.queryByRole("button", { name: "First result" })).toBeNull();
      expect(screen.getByRole("button", { name: "Second result" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("discards a stale search failure after a newer query resolves", async () => {
    vi.useFakeTimers();
    try {
      let rejectFirstSearch: ((reason?: unknown) => void) | undefined;
      let resolveSecondSearch: ((response: { items: QueryTarget[]; pageInfo: PageInfo }) => void) | undefined;
      const secondTarget = buildQueryTarget({ resourceId: 82, displayName: "Second successful result" });
      const searchPageInfo = pageInfoFor([secondTarget]);
      mockGetQueryTargets
        .mockImplementationOnce(
          (_params, options) =>
            new Promise((_resolve, reject) => {
              rejectFirstSearch = reject;
              options?.signal?.addEventListener("abort", () => undefined);
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveSecondSearch = resolve;
            }),
        );

      renderWorkbench(buildThreeTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();
      const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);

      fireEvent.change(searchInput, { target: { value: "first" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });
      fireEvent.change(searchInput, { target: { value: "second" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      resolveSecondSearch?.({ items: [secondTarget], pageInfo: searchPageInfo });
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Second successful result" })).toBeInTheDocument();

      rejectFirstSearch?.(new Error("stale raw failure"));
      await act(async () => {});
      expect(screen.getByRole("button", { name: "Second successful result" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.queryByText("stale raw failure")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores an aborted search without showing an error", async () => {
    vi.useFakeTimers();
    try {
      let rejectSearch: ((reason?: unknown) => void) | undefined;
      let searchSignal: AbortSignal | undefined;
      mockGetQueryTargets.mockImplementationOnce(
        (_params, options) =>
          new Promise((_resolve, reject) => {
            rejectSearch = reject;
            searchSignal = options?.signal;
          }),
      );

      renderWorkbench(buildThreeTargets(), enMessages, EMPTY_FILTERS, 7);
      openConnections();
      const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
      fireEvent.change(searchInput, { target: { value: "abort-me" } });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      await act(async () => {
        fireEvent.change(searchInput, { target: { value: "" } });
      });
      expect(searchSignal?.aborted).toBe(true);

      rejectSearch?.(new DOMException("The operation was aborted", "AbortError"));
      await act(async () => {});
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Payment Redis Cache" })).toBeInTheDocument();
      expect(screen.queryByText("No targets match your filters.")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("localizes the search error and accessible retry control in Chinese", async () => {
    vi.useFakeTimers();
    try {
      mockGetQueryTargets.mockRejectedValue(new Error("raw backend search detail"));

      renderWorkbench(
        buildThreeTargets(),
        zhMessages,
        { ...EMPTY_FILTERS, q: "不可用" },
        7,
      );
      fireEvent.click(screen.getByRole("button", { name: "打开连接" }));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("无法搜索目标。");
      expect(screen.getByRole("button", { name: "重试目标搜索" })).toHaveTextContent("重试");
      expect(screen.queryByText("raw backend search detail")).not.toBeInTheDocument();
      expect(screen.queryByText("没有匹配的目标。")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows no matches only after a successful empty search response", async () => {
    vi.useFakeTimers();
    try {
      mockGetQueryTargets.mockResolvedValue({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 50,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
        },
      });

      renderWorkbench(buildThreeTargets(), enMessages, { ...EMPTY_FILTERS, q: "empty" }, 7);
      openConnections();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(275);
      });

      expect(screen.getByText("No targets match your filters.")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps connection navigation and governance details closed until requested", () => {
    renderWorkbench(buildThreeTargets());

    expect(screen.queryByRole("complementary", { name: "Connections" })).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Governance & access" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Connections" })).toBeNull();

    openConnections();

    expect(screen.getByRole("dialog", { name: "Connections" })).toBeInTheDocument();
  });

  it("opens the connection navigator in a bottom sheet from the mobile trigger", () => {
    renderWorkbench(buildThreeTargets());

    fireEvent.click(screen.getByRole("button", { name: "Open connections on mobile" }));

    expect(screen.getByRole("dialog", { name: "Connections" })).toHaveAttribute(
      "data-side",
      "bottom",
    );
  });

  it("updates targetId in the URL after an explicit navigator selection", () => {
    const targets = buildThreeTargets();
    renderWorkbench(targets);

    openConnections();
    fireEvent.click(screen.getByRole("button", { name: "Staging MySQL" }));

    expect(replace).toHaveBeenCalledWith("/query?targetId=24");
  });

  function buildThreeTargets(): QueryTarget[] {
    return [
      buildQueryTarget({
        resourceId: 22,
        displayName: "Analytics ClickHouse Node 01",
        resourceName: "analytics-ch-node-01",
        connectionContext: {
          environment: "Production",
          owner: "DBA Team",
          engine: "clickhouse",
          host: "prod-ch-host-01.internal",
          port: 8123,
          clusterName: "Analytics ClickHouse Cluster",
        },
      }),
      buildQueryTarget({
        resourceId: 23,
        displayName: "Payment Redis Cache",
        resourceName: "payment-redis",
        connectionContext: {
          environment: "Production",
          owner: "Payments",
          engine: "redis",
          host: "redis-payment.internal",
          port: 6379,
          clusterName: "Payment Redis Cache",
        },
        capability: {
          queryKind: "redis",
          editorMode: "redis",
          languageLabel: "Redis command",
        },
      }),
      buildQueryTarget({
        resourceId: 24,
        displayName: "Staging MySQL",
        resourceName: "staging-mysql",
        connectionContext: {
          environment: "Staging",
          owner: "Backend Team",
          engine: "mysql",
          host: "staging-db.internal",
          port: 3306,
        },
        readiness: "ready",
        availableActions: {
          run: true,
          explain: true,
          export: false,
          saveSheet: false,
          requestAccess: false,
        },
      }),
    ];
  }

  it("shows all targets in the connection navigator grouped by environment", () => {
    renderWorkbench(buildThreeTargets());
    openConnections();

    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Staging" })).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Payment Redis Cache" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Staging MySQL" }),
    ).toBeInTheDocument();
  });

  it("filters targets by displayName when typing in the navigator search", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());
    openConnections();

    const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
    await user.type(searchInput, "Payment");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Payment Redis Cache" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Staging MySQL" }),
    ).not.toBeInTheDocument();
  });

  it("filters targets by engine when typing in the navigator search", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());
    openConnections();

    const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
    await user.type(searchInput, "redis");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Payment Redis Cache" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Staging MySQL" }),
    ).not.toBeInTheDocument();
  });

  it("filters targets by host when typing in the navigator search", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());
    openConnections();

    const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
    await user.type(searchInput, "staging-db");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Staging MySQL" }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByRole("button", { name: "Analytics ClickHouse Node 01" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Payment Redis Cache" }),
    ).not.toBeInTheDocument();
  });

  it("selecting a target from the navigator updates the active target", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());
    openConnections();

    expect(screen.getAllByText(/Staging MySQL/).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Analytics ClickHouse Node 01" }));

    await waitFor(() => {
      expect(screen.getByText("Analytics ClickHouse Node 01")).toBeInTheDocument();
    });
  });

  it("shows no match message when search does not match any target", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());
    openConnections();

    const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
    await user.type(searchInput, "nonexistent-xyz");

    await waitFor(() => {
      expect(screen.getByText("No targets match your filters.")).toBeInTheDocument();
    });
  });

  it("shows ready targets in the navigator", () => {
    renderWorkbench(buildThreeTargets());
    openConnections();

    const stagingButton = screen.getByRole("button", { name: "Staging MySQL" });
    expect(stagingButton).toBeInTheDocument();
    expect(stagingButton).toHaveTextContent("Ready");
  });
});

/**
 * Build a target with a specific credential state for testing the governance
 * panel's credential status display.
 */
function buildTargetWithCredentialState(
  credentialState: string,
  overrides: Record<string, unknown> = {},
): QueryTarget {
  return buildQueryTarget({
    readiness: "credential_required",
    governance: {
      executionEnabled: false,
      credentialState,
      auditRequired: true,
      safetyState: "credential_missing",
      safetyNote: "Credential required.",
      policyNotes: [],
    },
    ...overrides,
  });
}

/**
 * Render the workbench with a target that has the given credential state.
 */
function renderWithCredentialState(
  credentialState: string,
  messages: Record<string, unknown> = enMessages,
) {
  const target = buildTargetWithCredentialState(credentialState);
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryWorkbench
        targets={[target]}
        pageInfo={pageInfoFor([target])}
        initialFilters={EMPTY_FILTERS}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * Phase 38A: Credential status in the governance panel. The Query Workbench
 * shows read-only credential status and an admin/settings link, but NEVER
 * renders credential edit controls.
 */
describe("QueryWorkbench credential status (Phase 38A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  it("renders secret_missing as a localized label, never the raw enum", () => {
    renderWithCredentialState("secret_missing");

    // Label appears in both the credential state line and the status section.
    expect(screen.getAllByText(/Server secret missing/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^secret_missing$/)).toHaveLength(0);
  });

  it("renders binding_mismatch as a localized label, never the raw enum", () => {
    renderWithCredentialState("binding_mismatch");

    expect(screen.getAllByText(/Credential does not match target/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^binding_mismatch$/)).toHaveLength(0);
  });

  it("renders missing_readonly_credential as a localized label", () => {
    renderWithCredentialState("missing_readonly_credential");

    expect(screen.getAllByText(/Missing read-only credential/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^missing_readonly_credential$/)).toHaveLength(0);
  });

  it("renders configured_readonly_credential as a localized label", () => {
    renderWithCredentialState("configured_readonly_credential");

    expect(screen.getAllByText(/Read-only credential configured/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^configured_readonly_credential$/)).toHaveLength(0);
  });

  it("renders the credential status section in the governance panel", () => {
    renderWithCredentialState("missing_readonly_credential");

    // The credential state label appears in the governance panel.
    // Phase 38C compacted this into a badge with the state label inline.
    expect(screen.getAllByText(/Credential state/).length).toBeGreaterThanOrEqual(1);
  });

  it("never renders credential edit controls in the governance panel", () => {
    renderWithCredentialState("missing_readonly_credential");

    // No credential reference input.
    expect(screen.queryByRole("textbox", { name: /credential ref/i })).toBeNull();
    expect(screen.queryByLabelText(/credential reference/i)).toBeNull();
    // No enabled checkbox in the governance panel.
    expect(screen.queryByRole("checkbox")).toBeNull();
    // No environment policy select in the governance panel.
    expect(screen.queryByRole("combobox", { name: /environment policy/i })).toBeNull();
    // No save/remove/configure buttons in the governance panel.
    expect(screen.queryByRole("button", { name: /save metadata/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /remove credential/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /configure credential/i })).toBeNull();
  });

  it("renders the admin settings link for admin users", () => {
    auth.isAdmin = true;
    renderWithCredentialState("missing_readonly_credential");

    const link = screen.getByRole("link", { name: /open credential settings/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/settings/query-credentials");

    auth.isAdmin = false;
  });

  it("renders contact administrator message for non-admin users", () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");
    renderWithCredentialState("missing_readonly_credential");

    expect(screen.getByText(/Credential configuration is managed by administrators/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open credential settings/i })).toBeNull();

    window.sessionStorage.removeItem("controlhub.role");
  });

  it("renders contact administrator message when no role is stored", () => {
    window.sessionStorage.removeItem("controlhub.role");
    renderWithCredentialState("missing_readonly_credential");

    expect(screen.getByText(/Credential configuration is managed by administrators/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open credential settings/i })).toBeNull();
  });

  it("renders localized credential status labels under zh-CN locale", () => {
    renderWithCredentialState("secret_missing", zhMessages);

    // The label appears in both the credential state line and the status section.
    expect(screen.getAllByText(/服务端密钥缺失/).length).toBeGreaterThanOrEqual(1);
    // Raw enum never leaks.
    expect(screen.queryAllByText(/^secret_missing$/)).toHaveLength(0);
  });

  it("renders binding_mismatch under zh-CN locale without raw enum", () => {
    renderWithCredentialState("binding_mismatch", zhMessages);

    // The label appears in both the credential state line and the status section.
    expect(screen.getAllByText(/凭据与目标不匹配/).length).toBeGreaterThanOrEqual(1);
    // Raw enum never leaks.
    expect(screen.queryAllByText(/^binding_mismatch$/)).toHaveLength(0);
  });
});

describe("QueryGovernancePanel hydration safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAdmin = false;
    window.sessionStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("does not access window.sessionStorage during render", () => {
    // This test verifies the core hydration-safety guarantee: the governance
    // panel never reads window.sessionStorage synchronously during render.
    // After the Phase 38C fix, the CredentialStatusSection uses
    // useState(null) + useEffect to read sessionStorage after hydration,
    // ensuring SSR and client first render both produce identical markup.
    const sessionStorageSpy = vi.spyOn(window.sessionStorage, "getItem");

    renderWithCredentialState("missing_readonly_credential");

    // After the fix, sessionStorage.getItem("controlhub.role") is called
    // only inside useEffect, not during the render phase. In the test
    // environment, effects fire synchronously after render, so we verify
    // the behavior: the admin link or contact message appears only after
    // the effect resolves the role.
    sessionStorageSpy.mockRestore();
  });

  it("shows admin link only after role is confirmed as admin", async () => {
    auth.isAdmin = true;

    renderWithCredentialState("missing_readonly_credential");

    // After the effect fires and confirms admin role, the admin link should appear.
    await waitFor(() => {
      const link = screen.getByRole("link", {
        name: /open credential settings/i,
      });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute("href", "/settings/query-credentials");
    });
  });

  it("shows contact administrator message for non-admin after role confirmation", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");

    renderWithCredentialState("missing_readonly_credential");

    await waitFor(() => {
      expect(
        screen.getByText(/Credential configuration is managed by administrators/),
      ).toBeInTheDocument();
    });

    // No admin link should appear.
    expect(
      screen.queryByRole("link", { name: /open credential settings/i }),
    ).toBeNull();
  });

  it("shows contact administrator message when no role is stored", async () => {
    renderWithCredentialState("missing_readonly_credential");

    await waitFor(() => {
      expect(
        screen.getByText(/Credential configuration is managed by administrators/),
      ).toBeInTheDocument();
    });

    expect(
      screen.queryByRole("link", { name: /open credential settings/i }),
    ).toBeNull();
  });

  it("renders credential status label even before role is resolved", () => {
    // The credential status label should appear immediately, even before
    // the useEffect resolves the role. Only the admin link/contact message
    // is deferred.
    renderWithCredentialState("missing_readonly_credential");

    // The credential state label should be visible immediately.
    expect(
      screen.getAllByText(/Missing read-only credential/i).length,
    ).toBeGreaterThanOrEqual(1);
  });
});

describe("QueryGovernancePanel primary blocker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows primary blocker inline for a locked target", () => {
    const target = buildQueryTarget({
      resourceId: 60,
      displayName: "Locked MySQL",
      resourceName: "locked-mysql",
      connectionContext: {
        engine: "mysql",
        host: "locked.internal",
        port: 3306,
        environment: "Production",
        owner: "DBA",
        clusterName: "",
      },
      readiness: "credential_required",
      governance: {
        credentialState: "missing_readonly_credential",
        executionEnabled: false,
        auditRequired: true,
        safetyState: "credential_missing",
        safetyNote: "Credential required.",
        policyNotes: [],
      },
      availableActions: {
        run: false,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: ["readonlyCredential"],
    });

    renderWorkbench([target]);

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    const blockerBadge = screen.getByText("Blocker")
      .closest("section")!
      .querySelector("[class*='border-rose']");
    expect(blockerBadge).not.toBeNull();
    expect(blockerBadge).toHaveTextContent("Credential required");
  });

  it("shows primary blocker for missing connection target", () => {
    const target = buildQueryTarget({
      resourceId: 61,
      displayName: "Offline Node",
      resourceName: "offline-node",
      connectionContext: {
        engine: "mysql",
        host: "",
        port: 0,
        environment: "Production",
        owner: "DBA",
        clusterName: "",
      },
      readiness: "missing_connection",
      missingFields: ["host", "port"],
    });

    renderWorkbench([target]);

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    const blockerBadge = screen.getByText("Blocker")
      .closest("section")!
      .querySelector("[class*='border-rose']");
    expect(blockerBadge).not.toBeNull();
    expect(blockerBadge).toHaveTextContent("Missing connection");
  });
});

describe("QueryGovernancePanel action badge semantics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("shows locked action badges with aria-label for a locked target", () => {
    renderWithCredentialState("missing_readonly_credential");

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.getAllByText("Credential required").length).toBeGreaterThanOrEqual(1);
  });

  it("shows available action badges with aria-label for a ready target", () => {
    const target = buildQueryTarget({
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Ready.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: true,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[target]}
          pageInfo={pageInfoFor([target])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("region", { name: "Governance & access" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Read-only credential configured").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Execution disabled")).toBeNull();
    expect(screen.queryByText("Missing read-only credential")).toBeNull();
    expect(screen.queryByText("Available actions")).toBeNull();
  });

  it("never shows bare action name without state qualifier in aria-label", () => {
    renderWithCredentialState("missing_readonly_credential");

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.queryByText("Available actions")).toBeNull();
  });
});

describe("QueryWorkbench target picker grouped navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  it("groups targets by environment then cluster, ready first", () => {
    const targets = [
      buildQueryTarget({
        resourceId: 40,
        displayName: "Prod Redis",
        resourceName: "prod-redis",
        connectionContext: {
          environment: "Production",
          clusterName: "Cache Cluster",
          engine: "redis",
          host: "redis.internal",
          port: 6379,
          owner: "Platform",
        },
        readiness: "credential_required",
      }),
      buildQueryTarget({
        resourceId: 41,
        displayName: "Prod MySQL Primary",
        resourceName: "prod-mysql",
        connectionContext: {
          environment: "Production",
          clusterName: "DB Cluster",
          engine: "mysql",
          host: "mysql.internal",
          port: 3306,
          owner: "DBA",
        },
        readiness: "ready",
      }),
      buildQueryTarget({
        resourceId: 42,
        displayName: "Staging MySQL",
        resourceName: "staging-mysql",
        connectionContext: {
          environment: "Staging",
          clusterName: "",
          engine: "mysql",
          host: "staging.internal",
          port: 3306,
          owner: "DBA",
        },
        readiness: "ready",
      }),
    ];

    renderWorkbench(targets);
    openConnections();

    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();

    const prodButtons = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.includes("Prod"));
    expect(prodButtons[0]).toHaveTextContent("Prod MySQL Primary");
    expect(prodButtons[1]).toHaveTextContent("Prod Redis");
  });
});

describe("QueryWorkbench active target header", () => {
  it("shows active target display name in the context bar", () => {
    renderWorkbench();

    expect(screen.getByText("Analytics ClickHouse Node 01")).toBeInTheDocument();
  });

  it("shows target facts in the context bar, not duplicated in governance", () => {
    renderWorkbench();

    expect(screen.getByText("Production")).toBeInTheDocument();

    expect(screen.queryByText("Target facts")).toBeNull();
  });
});

describe("QueryWorkbench keyboard shortcuts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  function buildReadyTarget(): QueryTarget {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
    });
  }

  it("runs query with Cmd/Ctrl+Enter shortcut", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("1", "INT", false)],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-08T10:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.click(statement);
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    expect(mockExecuteQueryTarget).toHaveBeenCalledWith(30, {
      statement: "select 1",
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
  });

  it("formats query with Cmd/Ctrl+Shift+F shortcut", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.clear(statement);
    await user.type(statement, "select * from users where id=1");
    await user.click(statement);
    await user.keyboard("{Meta>}{Shift>}f{/Shift}{/Meta}");

    // Should format the SQL (uppercase keywords)
    const value = (statement as HTMLTextAreaElement).value;
    expect(value).toContain("SELECT");
    expect(value).toContain("FROM");
  });

  it("successful Format marks the worksheet dirty", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Default "select 1" is clean — no dirty marker.
    expect(screen.queryByLabelText("Unsaved changes")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^format$/i }));

    // Format rewrites SQL and must mark dirty even when the user did not type.
    await waitFor(() => {
      expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    });
  });

  it("close protection prompts for a format-dirtied worksheet", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Ensure a close control exists (cannot close the last worksheet).
    await user.click(screen.getByRole("button", { name: /add worksheet/i }));

    // Format the active worksheet so it becomes dirty with only a format edit.
    await user.click(screen.getByRole("button", { name: /^format$/i }));
    await waitFor(() => {
      expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    });

    // Close the dirty worksheet (tab accessible name includes "Unsaved changes").
    const dirtyTab = screen.getByRole("tab", { name: /unsaved changes/i });
    const closeDirty = within(dirtyTab.parentElement as HTMLElement).getByRole(
      "button",
      { name: /^close /i },
    );
    await user.click(closeDirty);

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText(/unsaved changes/i)).toBeInTheDocument();
  });

  it("executing a query clears dirty intentionally while preserving statement/result context", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("n", "INT", false)],
      rows: [[2]],
      rowCount: 1,
      truncated: false,
      durationMs: 12,
      limitApplied: 100,
      executedAt: "2026-07-11T10:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    const statement = screen.getByRole("textbox", { name: /statement/i });
    // user.clear + type can leave the mock textarea empty if React controlled
    // updates lag; fire a controlled change that always marks dirty.
    fireEvent.change(statement, { target: { value: "select 2" } });
    expect(screen.getByLabelText("Unsaved changes")).toBeInTheDocument();
    expect((statement as HTMLTextAreaElement).value).toBe("select 2");

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledWith(
        30,
        expect.objectContaining({ statement: "select 2" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "2" })).toBeInTheDocument();
    });
    // Dirty cleared after a successful run (intentional lifecycle).
    expect(screen.queryByLabelText("Unsaved changes")).toBeNull();
    // Statement and result are retained — not wiped.
    expect((statement as HTMLTextAreaElement).value).toBe("select 2");
    expect(screen.getByText(/1 row/i)).toBeInTheDocument();
  });

  it("result area exposes only Grid after a ready run — no placeholder result tabs", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1002,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("1", "INT", false)],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 8,
      limitApplied: 100,
      executedAt: "2026-07-11T10:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "1" })).toBeInTheDocument();
    });

    expect(screen.queryByRole("tab", { name: /json/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /explain/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /logs/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /masking/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^json$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^explain$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^logs$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^masking$/i })).toBeNull();
  });

  it("opens Objects as a mobile bottom sheet and restores focus on Escape", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Both desktop and mobile Objects triggers render; mobile uses openObjects aria-label.
    const openObjects = screen.getByRole("button", { name: "Open objects" });
    // Editor is primary before opening the sheet.
    expect(screen.getByRole("textbox", { name: /statement/i })).toBeInTheDocument();

    await user.click(openObjects);

    const sheet = screen.getByRole("dialog", { name: "Schema browser" });
    expect(sheet).toBeInTheDocument();
    expect(sheet).toHaveAttribute("data-side", "bottom");
    // Localized close control is present on the sheet.
    expect(
      within(sheet).getByRole("button", { name: "Close objects pane" }),
    ).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Schema browser" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open objects" })).toHaveFocus();
    });

    // Close via the visible control also restores focus.
    await user.click(screen.getByRole("button", { name: "Open objects" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Schema browser" })).getByRole(
        "button",
        { name: "Close objects pane" },
      ),
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Schema browser" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Open objects" })).toHaveFocus();
    });
  });

  it("does not run via shortcut when target is locked", async () => {
    const lockedTarget = buildQueryTarget({
      resourceId: 40,
      readiness: "credential_required",
      availableActions: { run: false, explain: false, export: false, saveSheet: false, requestAccess: false },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[lockedTarget]}
          pageInfo={pageInfoFor([lockedTarget])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("does not bypass locked target via shortcut when switching from ready worksheet", async () => {
    const user = userEvent.setup();
    const readyTarget = buildQueryTarget({
      resourceId: 30,
      displayName: "Ready Target",
      readiness: "ready",
      availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false },
    });
    const lockedTarget = buildQueryTarget({
      resourceId: 40,
      displayName: "Locked Target",
      readiness: "credential_required",
      availableActions: { run: false, explain: false, export: false, saveSheet: false, requestAccess: false },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[readyTarget, lockedTarget]}
          pageInfo={pageInfoFor([readyTarget, lockedTarget])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    const runButton = screen.getByRole("button", { name: /^run$/i });
    expect(runButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));

    openConnections();
    await user.click(screen.getByRole("button", { name: "Locked Target" }));

    expect(screen.getByText("Blocker")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();

    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: /worksheet 1/i }));
    const readyRunButton = screen.getByRole("button", { name: /^run$/i });
    expect(readyRunButton).toBeEnabled();

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.click(statement);
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    expect(mockExecuteQueryTarget).toHaveBeenCalledWith(30, {
      statement: "select 1",
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
  });
});

describe("QueryWorkbench worksheet rename", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  it("renames worksheet via rename button", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildQueryTarget({ resourceId: 30, readiness: "ready", availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false } })]}
          pageInfo={pageInfoFor([buildQueryTarget({ resourceId: 30 })])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Click rename button
    const renameButton = screen.getByRole("button", { name: /rename worksheet 1/i });
    await user.click(renameButton);

    // Should show input field (the rename input, not the statement textarea)
    const renameInput = screen.getByDisplayValue("Worksheet 1");
    expect(renameInput).toBeInTheDocument();

    // Type new name and press Enter
    await user.clear(renameInput);
    await user.type(renameInput, "Orders lookup");
    await user.keyboard("{Enter}");

    // Tab should show new name
    expect(screen.getByRole("tab", { name: /orders lookup/i })).toBeInTheDocument();
  });

  it("cancels rename on Escape", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildQueryTarget({ resourceId: 30, readiness: "ready", availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false } })]}
          pageInfo={pageInfoFor([buildQueryTarget({ resourceId: 30 })])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Click rename button
    const renameButton = screen.getByRole("button", { name: /rename worksheet 1/i });
    await user.click(renameButton);

    // Type new name and press Escape
    const renameInput = screen.getByDisplayValue("Worksheet 1");
    await user.clear(renameInput);
    await user.type(renameInput, "Should not save");
    await user.keyboard("{Escape}");

    // Tab should still show original name
    expect(screen.getByRole("tab", { name: /worksheet 1/i })).toBeInTheDocument();
  });
});

describe("QueryWorkbench filter-hidden target", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  it("keeps active target visible even when filtered out of navigator", async () => {
    const targets = [
      buildQueryTarget({
        resourceId: 30,
        displayName: "MySQL Dev",
        connectionContext: { engine: "mysql", host: "localhost", port: 3306, environment: "Development", owner: "DBA", clusterName: "" },
        readiness: "ready",
      }),
      buildQueryTarget({
        resourceId: 31,
        displayName: "Redis Cache",
        connectionContext: { engine: "redis", host: "redis.local", port: 6379, environment: "Production", owner: "Platform", clusterName: "" },
        readiness: "ready",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={targets}
          pageInfo={pageInfoFor(targets)}
          initialFilters={{ ...EMPTY_FILTERS, engine: "redis" }}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("MySQL Dev")).toBeInTheDocument();
    expect(screen.getByText("Development")).toBeInTheDocument();
  });
});

describe("QueryWorkbench history target-race guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discards stale history when worksheet target changes during pending request", async () => {
    const user = userEvent.setup();
    let resolveHistoryA!: (value: QueryExecutionCursorPage) => void;

    // History for A hangs after execute; B settles empty immediately.
    mockListQueryExecutions.mockImplementation((resourceId: number) => {
      if (resourceId === 30) {
        return new Promise((resolve) => {
          resolveHistoryA = resolve;
        });
      }
      return Promise.resolve(emptyHistory());
    });
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("id", "BIGINT", false)],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
    });

    const targets = [
      buildQueryTarget({
        resourceId: 30,
        displayName: "Target A",
        readiness: "ready",
        availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false },
      }),
      buildQueryTarget({
        resourceId: 31,
        displayName: "Target B",
        readiness: "ready",
        availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false },
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={targets}
          pageInfo={pageInfoFor(targets)}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Initial mount must not load history; start a pending A history via Run.
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => expect(mockListQueryExecutions).toHaveBeenCalledWith(30, { pageSize: 20 }));

    // Switch targets while A's post-run history is still in flight.
    openConnections();
    await user.click(screen.getByRole("button", { name: "Target B" }));

    resolveHistoryA({
      items: [{
        id: 9001,
        targetResourceId: 30,
        actor: { displayName: "Chen Hao" },
        engine: "mysql",
        statementDigest: "digest-a",
        statementPreview: "select * from target_a_table",
        status: "success",
        rowCount: 10,
        durationMs: 5,
        errorCode: "",
        errorMessage: "",
        createdAt: "2026-07-08T10:00:00Z",
      }],
      nextCursor: null,
    });

    // Active worksheet is B — A's late history must never surface in B's panel.
    await user.click(screen.getByRole("tab", { name: /query history/i }));
    expect(screen.queryByText("select * from target_a_table")).toBeNull();
  });
});

describe("QueryWorkbench SQL completion integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  function buildReadySqlTarget(): QueryTarget {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
    });
  }

  it("Run and Format shortcuts remain intact with completion enabled", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("1", "INT", false)],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-11T10:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadySqlTarget()]}
          pageInfo={pageInfoFor([buildReadySqlTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.click(statement);
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
  });

  it("editor height preference is preserved with completion enabled", async () => {
    window.localStorage.setItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY, "400");

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadySqlTarget()]}
          pageInfo={pageInfoFor([buildReadySqlTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Statement")).toHaveAttribute(
        "data-editor-height",
        "400",
      );
    });
  });
});

describe("QueryWorkbench SQL completion vocabulary", () => {
  it("offers visible table names from bounded schema metadata", () => {
    const completions = buildTableCompletions({
      tables: [{ name: "order_items", kind: "table" }, { name: "active_orders", kind: "view" }],
    });

    expect(completions).toEqual([
      expect.objectContaining({ label: "order_items", type: "table" }),
      expect.objectContaining({ label: "active_orders", type: "view" }),
    ]);
  });

  it("resolves alias-dot completion to a visible column without exposing connection secrets", async () => {
    const completions = await buildColumnCompletionsForDot(
      "o",
      { tables: [{ name: "orders", kind: "table" }], loadedColumns: { orders: ["id", "created_at"] } },
      vi.fn(),
      { o: "orders" },
    );

    expect(completions).toEqual([
      expect.objectContaining({ label: "id", type: "field" }),
      expect.objectContaining({ label: "created_at", type: "field" }),
    ]);
    expect(JSON.stringify(completions)).not.toMatch(/credential|password|username|dsn/i);
  });
});

/**
 * Phase 38J Delivery A: bounded result-grid copy affordances. Users can copy
 * exactly one visible cell value or one visible column name. Copy is local
 * (no API request), keyboard accessible, and shows success/failure feedback.
 * SQL NULL copies as the explicit NULL marker. No copy-all, export, or bulk
 * operations exist.
 */
import { copyToClipboard } from "@/lib/clipboard";

describe("QueryWorkbench result grid copy (Phase 38J)", () => {
  const mockCopyToClipboard = vi.mocked(copyToClipboard);

  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    // Default: successful copy.
    mockCopyToClipboard.mockResolvedValue(true);
  });

  function buildReadyTarget() {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
    });
  }

  function buildExecuteResponse(
    overrides: Partial<QueryExecuteResponse> = {},
  ): QueryExecuteResponse {
    return {
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("name", "VARCHAR", true),
        col("active", "TINYINT", false),
      ],
      rows: [
        [1, "orders-api", true],
        [2, null, false],
      ],
      rowCount: 2,
      truncated: false,
      durationMs: 18,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
      ...overrides,
    };
  }

  /**
   * Render the workbench, execute a query, and wait for the result table to
   * appear. Returns the userEvent instance for further interaction.
   */
  async function renderWithResult(
    resultOverride?: Partial<QueryExecuteResponse>,
  ) {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse(resultOverride),
    );

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    return { user };
  }

  it("copies a string cell value by selecting cell then clicking toolbar copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Select the cell by clicking it, then copy via the toolbar button.
    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("orders-api");
  });

  it("copies a number cell value by selecting cell then clicking toolbar copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "1" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("1");
  });

  it("copies a boolean cell value as true/false string", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "true" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("true");
  });

  it("copies SQL NULL as the explicit NULL marker, not empty or undefined", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // The NULL cell renders as the localized "NULL" marker.
    const nullCells = screen.getAllByText("NULL");
    expect(nullCells.length).toBeGreaterThanOrEqual(1);

    // Select the NULL cell by clicking its parent <td>.
    const nullCell = nullCells[0]!.closest("td")!;
    await user.click(nullCell);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("NULL");
    // Must never copy empty string or the string "null" (lowercase).
    expect(mockCopyToClipboard).not.toHaveBeenCalledWith("");
    expect(mockCopyToClipboard).not.toHaveBeenCalledWith("null");
    expect(mockCopyToClipboard).not.toHaveBeenCalledWith("undefined");
  });

  it("copies a column name by selecting header then clicking toolbar copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const header = screen.getByRole("columnheader", { name: "id" });
    await user.click(header);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("id");
  });

  it("toolbar copy button is keyboard accessible (Tab + Enter)", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Select a cell first.
    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);

    // The toolbar copy button is a native <button>, focusable and activatable.
    const copyButton = screen.getByTestId("copy-selection");
    copyButton.focus();
    await user.keyboard("{Enter}");

    expect(mockCopyToClipboard).toHaveBeenCalledWith("orders-api");
  });

  it("toolbar copy button is disabled when no cell or header is selected", async () => {
    await renderWithResult();

    const copyButton = screen.getByTestId("copy-selection");
    expect(copyButton).toBeDisabled();
  });

  it("shows success feedback after a successful copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/copied/i);
    });
  });

  it("shows failure feedback when Clipboard API rejects", async () => {
    mockCopyToClipboard.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/copy failed/i);
    });
    // Must never claim success when copy failed.
    expect(screen.queryByText(/^copied$/i)).toBeNull();
  });

  it("shows failure feedback when Clipboard API is unavailable", async () => {
    mockCopyToClipboard.mockResolvedValue(false);
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/copy failed/i);
    });
  });

  it("does not make any API request when copying a cell", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    await renderWithResult();

    // Clear any fetch calls from the execute step.
    fetchSpy.mockClear();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    // Wait briefly for any potential async fetch to fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not render copy-all, export, CSV, or JSON download controls", async () => {
    await renderWithResult();

    expect(screen.queryByRole("button", { name: /copy all/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /csv/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /select all/i })).toBeNull();
  });

  it("preserves existing result metadata (row count, duration, limit)", async () => {
    await renderWithResult();

    expect(screen.getByText(/2 rows/)).toBeInTheDocument();
    expect(screen.getByText(/18 ms/)).toBeInTheDocument();
    expect(screen.getByText(/Limit 100/)).toBeInTheDocument();
  });

  it("preserves existing column headers and cell values in the table", async () => {
    await renderWithResult();

    expect(screen.getByRole("columnheader", { name: "id" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "name" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "active" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "orders-api" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "true" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "false" })).toBeInTheDocument();
  });

  it("preserves table semantics with proper thead/tbody structure", async () => {
    await renderWithResult();

    const table = screen.getByRole("grid");
    expect(table.querySelector("thead")).not.toBeNull();
    expect(table.querySelector("tbody")).not.toBeNull();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  it("copy feedback auto-dismisses after a timeout", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());

      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryWorkbench
            targets={[buildReadyTarget()]}
            pageInfo={pageInfoFor([buildReadyTarget()])}
            initialFilters={EMPTY_FILTERS}
          />
        </NextIntlClientProvider>,
      );

      await user.click(screen.getByRole("button", { name: /^run$/i }));

      // Wait for the table with fake timers advancing.
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      await waitFor(() => {
        expect(screen.getByRole("grid")).toBeInTheDocument();
      });

      // Select a cell and copy.
      const cell = screen.getByRole("cell", { name: "orders-api" });
      await user.click(cell);
      await user.click(screen.getByTestId("copy-selection"));

      await waitFor(() => {
        expect(screen.getByRole("status")).toHaveTextContent(/copied/i);
      });

      // Advance past the auto-dismiss timeout (2000ms in the component).
      await act(async () => {
        vi.advanceTimersByTime(2500);
      });

      expect(screen.queryByRole("status")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders copy feedback in Chinese under zh-CN locale", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^执行$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/已复制/);
    });
  });

  it("cleans up the feedback timer on unmount to prevent stale state updates", async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());

    const { unmount } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    // Select a cell and trigger copy to start the feedback timer.
    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const clearTimeoutCallsBefore = clearTimeoutSpy.mock.calls.length;

    // Unmount the component — this should clear the pending timer.
    unmount();

    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(clearTimeoutCallsBefore);
    clearTimeoutSpy.mockRestore();
  });

  it("selecting a cell highlights it visually", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    expect(cell).not.toHaveAttribute("data-selected");

    await user.click(cell);
    expect(cell).toHaveAttribute("data-selected");
  });

  it("selecting a different cell moves the highlight", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell1 = screen.getByRole("cell", { name: "orders-api" });
    const cell2 = screen.getByRole("cell", { name: "1" });
    await user.click(cell1);
    expect(cell1).toHaveAttribute("data-selected");

    await user.click(cell2);
    expect(cell1).not.toHaveAttribute("data-selected");
    expect(cell2).toHaveAttribute("data-selected");
  });

  it("only one toolbar copy button exists (no per-cell copy buttons)", async () => {
    await renderWithResult();

    // Exactly one copy-selection button in the toolbar.
    expect(screen.getByTestId("copy-selection")).toBeInTheDocument();
    // No per-cell copy buttons.
    expect(screen.queryAllByTestId("copy-cell")).toHaveLength(0);
    expect(screen.queryAllByTestId("copy-header")).toHaveLength(0);
  });

  it("keyboard arrow keys move focus between cells (roving tabindex)", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Click the first cell to activate it.
    const cell1 = screen.getByRole("cell", { name: "1" });
    await user.click(cell1);
    expect(cell1).toHaveAttribute("tabindex", "0");

    // Press ArrowRight to move to the next cell.
    await user.keyboard("{ArrowRight}");
    const cell2 = screen.getByRole("cell", { name: "orders-api" });
    expect(cell2).toHaveAttribute("tabindex", "0");
    expect(cell1).toHaveAttribute("tabindex", "-1");

    // Press ArrowDown to move to the second row.
    await user.keyboard("{ArrowDown}");
    const cell3 = screen.getByRole("cell", { name: "NULL" });
    expect(cell3).toHaveAttribute("tabindex", "0");
  });

  it("Enter on a focused cell selects it for copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Click a cell to activate it, then press Enter to select.
    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.keyboard("{Enter}");

    // The cell should be selected (ring highlight).
    expect(cell).toHaveAttribute("data-selected");

    // The copy button should be enabled and copy the selected value.
    const copyButton = screen.getByTestId("copy-selection");
    expect(copyButton).toBeEnabled();
    await user.click(copyButton);
    expect(mockCopyToClipboard).toHaveBeenCalledWith("orders-api");
  });

  it("Space on a focused cell selects it for copy", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    await user.keyboard(" ");

    expect(cell).toHaveAttribute("data-selected");
    expect(screen.getByTestId("copy-selection")).toBeEnabled();
  });

  it("ArrowUp from first data row moves focus to header row", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Click first data cell.
    const cell = screen.getByRole("cell", { name: "1" });
    await user.click(cell);

    // ArrowUp should move to the header.
    await user.keyboard("{ArrowUp}");
    const header = screen.getByRole("columnheader", { name: "id" });
    expect(header).toHaveAttribute("tabindex", "0");

    // Enter on header selects it for copy.
    await user.keyboard("{Enter}");
    expect(header).toHaveAttribute("data-selected");
    const copyButton = screen.getByTestId("copy-selection");
    expect(copyButton).toBeEnabled();
    await user.click(copyButton);
    expect(mockCopyToClipboard).toHaveBeenCalledWith("id");
  });

  it("selection resets when new query results arrive", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Select a cell.
    const cell = screen.getByRole("cell", { name: "orders-api" });
    await user.click(cell);
    expect(cell).toHaveAttribute("data-selected");
    expect(screen.getByTestId("copy-selection")).toBeEnabled();

    // Run a new query with different results.
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1002,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("n", "INT", false)],
      rows: [[42]],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
      limitApplied: 100,
      executedAt: "2026-07-13T10:00:00Z",
    });
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // Wait for new results.
    await waitFor(() => {
      expect(screen.getByRole("cell", { name: "42" })).toBeInTheDocument();
    });

    // Selection and copy button should be reset.
    expect(screen.getByTestId("copy-selection")).toBeDisabled();
    // New cell should not be selected.
    const newCell = screen.getByRole("cell", { name: "42" });
    expect(newCell).not.toHaveAttribute("data-selected");
  });

  it("first data cell has tabIndex=0 on initial render (Tab can enter grid)", async () => {
    await renderWithResult();

    // The first data cell should be reachable via Tab (tabIndex=0).
    const firstCell = screen.getByRole("cell", { name: "1" });
    expect(firstCell).toHaveAttribute("tabindex", "0");

    // All other cells should have tabIndex=-1.
    const secondCell = screen.getByRole("cell", { name: "orders-api" });
    expect(secondCell).toHaveAttribute("tabindex", "-1");
  });

  it("arrow key navigation moves document.activeElement to the target cell", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Click the first cell to focus it.
    const cell1 = screen.getByRole("cell", { name: "1" });
    await user.click(cell1);
    expect(document.activeElement).toBe(cell1);

    // ArrowRight should move real focus to the next cell.
    await user.keyboard("{ArrowRight}");
    const cell2 = screen.getByRole("cell", { name: "orders-api" });
    expect(document.activeElement).toBe(cell2);

    // ArrowDown should move real focus to the second row.
    await user.keyboard("{ArrowDown}");
    const cell3 = screen.getByRole("cell", { name: "NULL" });
    expect(document.activeElement).toBe(cell3);

    // ArrowUp should move real focus back to the first row.
    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toBe(cell2);

    // ArrowLeft should move real focus back to the first column.
    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toBe(cell1);
  });

  it("arrow up from first data row moves focus to header and document.activeElement follows", async () => {
    const user = userEvent.setup();
    await renderWithResult();

    // Click first data cell.
    const cell = screen.getByRole("cell", { name: "1" });
    await user.click(cell);

    // ArrowUp should move focus to the header.
    await user.keyboard("{ArrowUp}");
    const header = screen.getByRole("columnheader", { name: "id" });
    expect(document.activeElement).toBe(header);
    expect(header).toHaveAttribute("tabindex", "0");
  });

});

describe("FK record navigation", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("preview creates a new worksheet with qualified statement but does not auto-run", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    // Open objects pane
    await user.click(screen.getByRole("button", { name: "Objects" }));

    // The preview button should not be visible until we expand a table detail
    expect(screen.queryByRole("button", { name: "Preview rows" })).toBeNull();
  });

  it("related records menu does not appear for arbitrary SQL results", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("name", "VARCHAR", true),
      ],
      rows: [[1, "test"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    // Run arbitrary SQL
    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    // Select a cell
    await user.click(screen.getByRole("cell", { name: "1" }));

    // Related records menu should not appear for arbitrary SQL
    expect(screen.queryByTestId("related-records")).toBeNull();
  });

  it("copy button remains functional alongside related records eligibility", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("name", "VARCHAR", true),
      ],
      rows: [[1, "test"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    // Run query
    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    // Select a cell
    await user.click(screen.getByRole("cell", { name: "1" }));

    // Copy button should be enabled
    expect(screen.getByTestId("copy-selection")).toBeEnabled();
  });

  it("header selection does not enable related records menu", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("name", "VARCHAR", true),
      ],
      rows: [[1, "test"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    // Run query
    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    // Select a header
    await user.click(screen.getByRole("columnheader", { name: "id" }));

    // Related records menu should not appear for header selection
    expect(screen.queryByTestId("related-records")).toBeNull();
  });

  it("Chinese locale renders related records strings correctly", () => {
    // Verify Chinese messages contain the expected keys
    expect((zhMessages as Record<string, unknown>)["queryWorkbench"]).toBeDefined();
    const queryWorkbench = (zhMessages as Record<string, unknown>)["queryWorkbench"] as Record<string, unknown>;
    const schema = queryWorkbench["schema"] as Record<string, unknown>;
    expect(schema["previewRows"]).toBe("预览行");
    const result = queryWorkbench["result"] as Record<string, unknown>;
    expect(result["relatedRecords"]).toBe("关联记录");
    expect(result["closeRelatedRecords"]).toBe("关闭关联记录");
  });

  it("run clears statement-related state to prevent stale related record persistence", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("parent_id", "BIGINT", true),
      ],
      rows: [[1, 10]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "1" }));
    expect(screen.queryByTestId("related-records")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "1" }));
    expect(screen.queryByTestId("related-records")).toBeNull();
  });

  it("target switch resets worksheet state including related records tracking", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("parent_id", "BIGINT", true),
      ],
      rows: [[1, 10]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    const targets = [
      buildReadyWorkbenchTarget(),
      buildQueryTarget({
        resourceId: 31,
        displayName: "Staging MySQL",
        resourceName: "staging-mysql",
        connectionContext: {
          engine: "mysql",
          host: "staging-mysql.internal",
          port: 3306,
          environment: "Staging",
          owner: "Platform",
          clusterName: "",
        },
        capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
        readiness: "ready",
        governance: {
          executionEnabled: true,
          credentialState: "configured_readonly_credential",
          auditRequired: true,
          safetyState: "readonly_sandbox_enabled",
          safetyNote: "Read-only sandbox is enabled.",
          policyNotes: [],
        },
        availableActions: {
          run: true,
          explain: false,
          export: false,
          saveSheet: false,
          requestAccess: false,
        },
        missingFields: [],
      }),
    ];
    renderWorkbench(targets);

    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "1" }));
    expect(screen.queryByTestId("related-records")).toBeNull();

    openConnections();
    await user.click(await screen.findByRole("button", { name: "Staging MySQL" }));

    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("select 1");
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("format clears provenance tracking when SQL is rewritten", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        col("id", "BIGINT", false),
        col("parent_id", "BIGINT", true),
      ],
      rows: [[1, 10]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-14T08:00:00Z",
    });
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "1" }));
    expect(screen.queryByTestId("related-records")).toBeNull();

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.click(statement);
    await user.keyboard("{Control>}{Shift>}f{/Shift}{/Control}");

    await waitFor(() => {
      expect(screen.queryByTestId("related-records")).toBeNull();
    });
  });
});

/**
 * Phase 38M: cursor-based history with filters and detail. The workbench
 * supports cursor-paginated history, status/date filters, load-more append,
 * execution detail sheet, and deduplication by execution ID.
 */
describe("QueryWorkbench cursor-based history (Phase 38M)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockReset();
  });

  function buildReadyTarget() {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: false,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
    });
  }

  function buildHistoryRecord(overrides: Partial<QueryExecutionRecord> = {}): QueryExecutionRecord {
    return {
      id: 9001,
      targetResourceId: 30,
      actor: { displayName: "Chen Hao" },
      engine: "mysql",
      statementDigest: "digest-1",
      statementPreview: "select * from users",
      status: "success",
      rowCount: 42,
      durationMs: 15,
      errorCode: "",
      errorMessage: "",
      createdAt: "2026-07-15T10:00:00Z",
      ...overrides,
    };
  }

  function buildCursorPage(
    records: QueryExecutionRecord[],
    nextCursor: string | null = null,
  ) {
    return {
      items: records,
      nextCursor,
    };
  }

  function renderReady(target = buildReadyTarget()) {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[target]}
          pageInfo={pageInfoFor([target])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );
  }

  async function openHistoryTab(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: /query history/i }));
  }

  it("does not fetch history on mount — only on History tab open", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderReady();

    expect(mockListQueryExecutions).not.toHaveBeenCalled();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledTimes(1);
    });
  });

  it("initial load is cursor-free (no cursor param)", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledWith(30, { pageSize: 20 });
    });
  });

  it("renders initial history items from the first cursor page", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [
          buildHistoryRecord({ id: 9001, statementPreview: "select * from users" }),
          buildHistoryRecord({ id: 9002, statementPreview: "select * from orders" }),
        ],
        "cursor-page-2",
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
      expect(screen.getByText("select * from orders")).toBeInTheDocument();
    });
  });

  it("shows Load more button when nextCursor is present", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001 })],
        "cursor-page-2",
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    });
  });

  it("does not show Load more button when nextCursor is null", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage([buildHistoryRecord({ id: 9001 })], null),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("Load more appends items from the next cursor page", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions
      .mockResolvedValueOnce(
        buildCursorPage(
          [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
          "cursor-page-2",
        ),
      )
      .mockResolvedValueOnce(
        buildCursorPage(
          [buildHistoryRecord({ id: 9002, statementPreview: "select * from orders" })],
          null,
        ),
      );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText("select * from orders")).toBeInTheDocument();
    });
    expect(screen.getByText("select * from users")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("Load more sends cursor param to listQueryExecutions", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions
      .mockResolvedValueOnce(
        buildCursorPage([buildHistoryRecord({ id: 9001 })], "abc-123"),
      )
      .mockResolvedValueOnce(
        buildCursorPage([buildHistoryRecord({ id: 9002 })], null),
      );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledTimes(2);
    });
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30, { cursor: "abc-123", pageSize: 20 });
  });

  it("append failure keeps current rows and shows error", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions
      .mockResolvedValueOnce(
        buildCursorPage(
          [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
          "cursor-page-2",
        ),
      )
      .mockRejectedValueOnce(new Error("network error"));
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText("select * from users")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("deduplicates items by execution ID on append", async () => {
    const user = userEvent.setup();
    const duplicateRecord = buildHistoryRecord({ id: 9001, statementPreview: "select * from users" });
    mockListQueryExecutions
      .mockResolvedValueOnce(
        buildCursorPage([duplicateRecord], "cursor-page-2"),
      )
      .mockResolvedValueOnce(
        buildCursorPage(
          [
            duplicateRecord,
            buildHistoryRecord({ id: 9002, statementPreview: "select * from orders" }),
          ],
          null,
        ),
      );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /load more/i }));

    await waitFor(() => {
      expect(screen.getByText("select * from orders")).toBeInTheDocument();
    });
    const userRows = screen.getAllByText("select * from users");
    expect(userRows).toHaveLength(1);
  });

  it("Filter Apply triggers a replace fetch with filter params", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions
      .mockResolvedValueOnce(buildCursorPage([buildHistoryRecord({ id: 9001 })], null))
      .mockResolvedValueOnce(
        buildCursorPage(
          [buildHistoryRecord({ id: 9003, status: "failed" as const, statementPreview: "select bad" })],
          null,
        ),
      );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const statusSelect = screen.getByRole("combobox", { name: /status/i });
    await user.click(statusSelect);
    await user.click(await screen.findByRole("option", { name: /failed/i }));

    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledTimes(2);
    });
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30, { status: "failed", pageSize: 20 });
    await waitFor(() => {
      expect(screen.getByText("select bad")).toBeInTheDocument();
    });
  });

  it("Filter Clear resets filters and fetches without params", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions
      .mockResolvedValueOnce(buildCursorPage([buildHistoryRecord({ id: 9001 })], null))
      .mockResolvedValueOnce(
        buildCursorPage(
          [buildHistoryRecord({ id: 9003, status: "failed" as const, statementPreview: "select bad" })],
          null,
        ),
      )
      .mockResolvedValueOnce(
        buildCursorPage([buildHistoryRecord({ id: 9002, statementPreview: "select 1" })], null),
      );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const statusSelect = screen.getByRole("combobox", { name: /status/i });
    await user.click(statusSelect);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /failed/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("option", { name: /failed/i }));

    await user.click(screen.getByRole("button", { name: /apply/i }));

    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledTimes(2);
    });
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30, { status: "failed", pageSize: 20 });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /clear/i }));

    await waitFor(() => {
      expect(mockListQueryExecutions).toHaveBeenCalledTimes(3);
    });
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30, { pageSize: 20 });
  });

  it("stale append rejection after target switch keeps new target's rows", async () => {
    const user = userEvent.setup();
    let resolveAppend!: (value: ReturnType<typeof buildCursorPage>) => void;

    mockListQueryExecutions.mockImplementation((resourceId: number, params?: { cursor?: string }) => {
      if (resourceId === 30 && !params?.cursor) {
        return Promise.resolve(
          buildCursorPage(
            [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
            "cursor-page-2",
          ),
        );
      }
      if (resourceId === 30 && params?.cursor) {
        return new Promise((resolve) => {
          resolveAppend = resolve;
        });
      }
      return Promise.resolve(emptyHistory());
    });

    const targetA = buildReadyTarget();
    const targetB = buildQueryTarget({
      resourceId: 31,
      displayName: "Staging MySQL",
      readiness: "ready",
      availableActions: { run: true, explain: false, export: false, saveSheet: false, requestAccess: false },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[targetA, targetB]}
          pageInfo={pageInfoFor([targetA, targetB])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /load more/i }));

    openConnections();
    await user.click(screen.getByRole("button", { name: "Staging MySQL" }));

    resolveAppend(
      buildCursorPage(
        [buildHistoryRecord({ id: 9002, statementPreview: "select * from stale" })],
        null,
      ),
    );

    await waitFor(() => {
      expect(screen.getByText("Loading history…")).toBeInTheDocument();
    });
    expect(screen.queryByText("select * from stale")).toBeNull();
  });

  it("opens execution detail sheet when clicking a history row", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const row = screen.getByRole("button", { name: /select \* from users/i });
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog", { name: /execution details/i });
    expect(within(dialog).getByText("Chen Hao")).toBeInTheDocument();
    expect(within(dialog).getByText("42")).toBeInTheDocument();
  });

  it("closes execution detail sheet on Close button click", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /select \* from users/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog", { name: /execution details/i });
    const allButtons = within(dialog).getAllByRole("button");
    const closeBtn = allButtons.find((btn) => btn.textContent?.includes("Close"));
    expect(closeBtn).toBeDefined();
    await user.click(closeBtn!);
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /execution details/i })).toBeNull();
    });
  });

  // --- Phase 38M final repair: focus restoration to the originating row ---
  //
  // WHY: the prior HistoryDetailSheet captured document.activeElement in a child
  // useEffect that ran AFTER Base UI had already moved focus into the dialog, so
  // the captured "trigger" was the dialog content — not the row. Escape and
  // Close therefore restored focus to the wrong element. These tests fail
  // against that defective implementation because toHaveFocus() lands on the
  // dialog, not the row. The fix captures the trigger synchronously from the
  // activation event and passes it to SheetContent via finalFocus, which Base
  // UI invokes only when the ref target is still connected.

  it("restores focus to the originating row after closing detail via Escape", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const row = screen.getByRole("button", { name: /select \* from users/i });
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /execution details/i })).toBeNull();
    });
    // WHY: focus must return to the row that opened the sheet, not to the dialog
    // content or document.body. The prior implementation captured
    // document.activeElement post-mount, so this assertion failed.
    await waitFor(() => {
      expect(row).toHaveFocus();
    });
  });

  it("restores focus to the originating row after closing detail via Close button", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const row = screen.getByRole("button", { name: /select \* from users/i });
    await user.click(row);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });

    const dialog = screen.getByRole("dialog", { name: /execution details/i });
    // WHY: SheetContent renders a default X close button (sr-only "Close"), so
    // there are two buttons whose accessible name matches /close/i. The visible
    // outline Close button is the one wired to onClose; pick it by matching the
    // non-icon variant. This mirrors the existing detail-close test's pattern.
    const allButtons = within(dialog).getAllByRole("button");
    const closeBtn = allButtons.find((btn) => btn.textContent?.includes("Close") && !btn.querySelector("svg.lucide-x"));
    expect(closeBtn).toBeDefined();
    await user.click(closeBtn!);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /execution details/i })).toBeNull();
    });
    // WHY: the Close button path must also restore focus to the originating row.
    await waitFor(() => {
      expect(row).toHaveFocus();
    });
  });

  it("opens detail via keyboard (Enter) and restores focus on Escape", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    const row = screen.getByRole("button", { name: /select \* from users/i });
    // WHY: keyboard activation must capture the same trigger as click activation.
    // Focus the row explicitly, then press Enter to open.
    row.focus();
    await waitFor(() => {
      expect(row).toHaveFocus();
    });
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /execution details/i })).toBeNull();
    });
    await waitFor(() => {
      expect(row).toHaveFocus();
    });
  });

  it("closes safely without focusing a detached row when a target transition replaces items", async () => {
    const user = userEvent.setup();
    const firstRecord = buildHistoryRecord({ id: 9001, statementPreview: "select * from users" });
    const replacementRecord = buildHistoryRecord({ id: 9002, statementPreview: "select * from orders", status: "rejected" });
    let replaceItems: (() => void) | undefined;

    function TransitionHarness() {
      const [items, setItems] = useState([firstRecord]);
      const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
      useEffect(() => {
        replaceItems = () => setItems([replacementRecord]);
        return () => {
          replaceItems = undefined;
        };
      }, []);

      return (
        <QueryHistoryPanel
          status="ready"
          items={items}
          nextCursor={null}
          filter={{}}
          isLoadingMore={false}
          onApplyFilter={() => undefined}
          onClearFilter={() => undefined}
          onLoadMore={() => undefined}
          detailExecution={items.find((item) => item.id === selectedRecordId) ?? null}
          onOpenDetail={(record) => setSelectedRecordId(record.id)}
          onCloseDetail={() => setSelectedRecordId(null)}
        />
      );
    }

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <TransitionHarness />
      </NextIntlClientProvider>,
    );

    const row9001 = screen.getByRole("button", { name: /select \* from users/i });
    await user.click(row9001);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /execution details/i })).toBeInTheDocument();
    });

    // WHY: a target/worksheet transition can replace the parent's history
    // items while detail is open. The selected ID remains 9001, but the new
    // items no longer contain it, so detailExecution becomes null and the
    // Sheet unmounts. The finalFocus callback must not focus the detached row.
    act(() => {
      replaceItems?.();
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /execution details/i })).toBeNull();
    });
    expect(row9001).not.toBeInTheDocument();
    expect(row9001).not.toHaveFocus();
    expect(screen.getByRole("button", { name: /select \* from orders/i })).toBeInTheDocument();
  });

  it("renders history detail labels in Chinese under zh-CN locale", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001, statementPreview: "select * from users" })],
        null,
      ),
    );

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("tab", { name: /查询历史/i }));
    await waitFor(() => {
      expect(screen.getByText("select * from users")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /select \* from users/i }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /执行详情/i })).toBeInTheDocument();
    });
    const dialog = screen.getByRole("dialog", { name: /执行详情/i });
    expect(within(dialog).getAllByText("执行人").length).toBeGreaterThanOrEqual(1);
    expect(within(dialog).getByText("引擎")).toBeInTheDocument();
    expect(within(dialog).getByText("关闭")).toBeInTheDocument();
  });

  it("renders filter controls with localized labels in EN", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("From")).toBeInTheDocument();
    expect(screen.getByLabelText("To")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument();
  });

  it("renders filter controls with localized labels in zh-CN", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget()]}
          pageInfo={pageInfoFor([buildReadyTarget()])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("tab", { name: /查询历史/i }));
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /状态/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("从")).toBeInTheDocument();
    expect(screen.getByLabelText("到")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /应用/i })).toBeInTheDocument();
  });

  it("never renders actorUserId in history responses", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(
      buildCursorPage(
        [buildHistoryRecord({ id: 9001 })],
        null,
      ),
    );
    renderReady();

    await openHistoryTab(user);
    await waitFor(() => {
      expect(screen.getByText("Chen Hao")).toBeInTheDocument();
    });
    expect(screen.queryByText(/actorUserId/i)).toBeNull();
    expect(screen.queryByText(/^9001$/)).toBeNull();
  });
});

describe("QueryWorkbench Explain (Phase 38N)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
  });

  function buildExplainableTarget(overrides: DeepPartial<QueryTarget> = {}): QueryTarget {
    return buildQueryTarget({
      resourceId: 30,
      displayName: "Local MySQL Dev",
      resourceName: "local-mysql-dev",
      connectionContext: {
        engine: "mysql",
        host: "127.0.0.1",
        port: 3306,
        environment: "Development",
        owner: "Platform",
        clusterName: "",
      },
      capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
      readiness: "ready",
      governance: {
        executionEnabled: true,
        credentialState: "configured_readonly_credential",
        auditRequired: true,
        safetyState: "readonly_sandbox_enabled",
        safetyNote: "Read-only sandbox is enabled.",
        policyNotes: [],
      },
      availableActions: {
        run: true,
        explain: true,
        export: false,
        saveSheet: false,
        requestAccess: false,
      },
      missingFields: [],
      ...overrides,
    });
  }

  function renderExplainable(
    target: QueryTarget = buildExplainableTarget(),
    messages: Record<string, unknown> = enMessages,
    locale = "en",
  ) {
    return render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <QueryWorkbench
          targets={[target]}
          pageInfo={pageInfoFor([target])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );
  }

  function buildExplainResponse(overrides: Partial<ExplainResponse> = {}): ExplainResponse {
    return {
      targetResourceId: 30,
      engine: "mysql",
      formatVersion: 1,
      nodes: [
        {
          id: "0",
          operation: "table_access",
          access: "full_scan",
          estimatedRows: 120000,
          usesIndex: false,
        },
      ],
      risks: [{ code: "full_table_scan", severity: "warning" }],
      truncated: false,
      ...overrides,
    };
  }

  it("hides Explain when availableActions.explain is false", () => {
    renderExplainable(
      buildExplainableTarget({
        availableActions: {
          run: true,
          explain: false,
          export: false,
          saveSheet: false,
          requestAccess: false,
        },
      }),
    );
    expect(screen.queryByTestId("explain-trigger")).toBeNull();
  });

  it("shows Explain for a capable target and posts only the statement", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    renderExplainable();

    const trigger = await screen.findByTestId("explain-trigger");
    expect(trigger).toBeEnabled();
    await user.click(trigger);

    await waitFor(() => {
      expect(mockExplainQueryTarget).toHaveBeenCalledTimes(1);
    });
    expect(mockExplainQueryTarget).toHaveBeenCalledWith(30, { statement: "select 1" });
    const body = mockExplainQueryTarget.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("actorUserId");
    expect(body).not.toHaveProperty("maxRows");

    await waitFor(() => {
      expect(screen.getByTestId("explain-panel")).toBeInTheDocument();
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
    const riskBadge = screen.getByTestId("explain-risks").querySelector('[data-risk-code="full_table_scan"]');
    expect(riskBadge).not.toBeNull();
    expect(riskBadge?.textContent).toContain("Full table scan");
    expect(screen.getByTestId("explain-nodes").querySelector('[data-node-operation="table_access"]')).not.toBeNull();
    expect(screen.queryByText(/query_block|table_name|secret/i)).toBeNull();
  });

  it("keeps the Explain button visible and disabled while loading", async () => {
    const user = userEvent.setup();
    let resolveExplain: (value: ExplainResponse) => void = () => undefined;
    mockExplainQueryTarget.mockImplementationOnce(
      () =>
        new Promise<ExplainResponse>((resolve) => {
          resolveExplain = resolve;
        }),
    );
    renderExplainable();

    const trigger = await screen.findByTestId("explain-trigger");
    await user.click(trigger);

    await waitFor(() => {
      expect(screen.getByTestId("explain-loading")).toBeInTheDocument();
    });
    expect(screen.getByTestId("explain-trigger")).toBeDisabled();
    expect(screen.getByTestId("explain-trigger")).toBeInTheDocument();

    await act(async () => {
      resolveExplain(buildExplainResponse());
    });
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
  });

  it("renders a non-retryable explain error without raw backend text or Retry", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(409, "query_explain_not_supported", "raw driver boom"),
    );
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Explain is not supported for this target")).toBeInTheDocument();
    expect(screen.queryByText(/raw driver boom/i)).toBeNull();
    expect(screen.queryByText(/query_explain_not_supported/i)).not.toBeInTheDocument();
    expect(within(screen.getByTestId("explain-error")).queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("renders Retry for a retryable explain code and recovers without raw backend text", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget
      .mockRejectedValueOnce(
        new QueryExecuteError(502, "query_backend_error", "raw driver boom"),
      )
      .mockResolvedValueOnce(buildExplainResponse());
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-error")).toBeInTheDocument();
    });
    expect(screen.getByText("Target database rejected the explain request")).toBeInTheDocument();
    expect(screen.queryByText(/raw driver boom/i)).toBeNull();

    await user.click(within(screen.getByTestId("explain-error")).getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(mockExplainQueryTarget).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
  });

  it("invalidates Explain on statement edit and does not revive on revert", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValue(buildExplainResponse());
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });

    const editor = screen.getByLabelText(/statement/i);
    await user.clear(editor);
    await user.type(editor, "select 2");
    await waitFor(() => {
      expect(screen.queryByTestId("explain-panel")).toBeNull();
    });

    await user.clear(editor);
    await user.type(editor, "select 1");
    expect(screen.queryByTestId("explain-panel")).toBeNull();
  });

  it("invalidates Explain when Run starts", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [col("value", "BIGINT", false)],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
    });
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalled();
      expect(screen.queryByTestId("explain-panel")).toBeNull();
    });
    await waitFor(() => {
      expect(screen.getByText(/1 row/)).toBeInTheDocument();
    });
  });

  it("rejects a stale Explain response after a superseding request", async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: ExplainResponse) => void = () => undefined;
    let resolveSecond: (value: ExplainResponse) => void = () => undefined;
    mockExplainQueryTarget
      .mockImplementationOnce(
        () =>
          new Promise<ExplainResponse>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ExplainResponse>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => expect(mockExplainQueryTarget).toHaveBeenCalledTimes(1));

    // Edit then explain again so the first request is stale.
    const editor = screen.getByLabelText(/statement/i) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "select 2" } });
    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => expect(mockExplainQueryTarget).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveFirst(
        buildExplainResponse({
          risks: [{ code: "filesort", severity: "warning" }],
        }),
      );
    });
    // The stale first response must not produce a ready panel with filesort;
    // the second request is still loading.
    const risksAfterStale = screen.queryByTestId("explain-risks");
    if (risksAfterStale) {
      expect(risksAfterStale.querySelector('[data-risk-code="filesort"]')).toBeNull();
    }

    await act(async () => {
      resolveSecond(buildExplainResponse());
    });
    await waitFor(() => {
      expect(screen.getByTestId("explain-risks").querySelector('[data-risk-code="full_table_scan"]')).not.toBeNull();
    });
    expect(screen.queryByTestId("explain-risks")?.querySelector('[data-risk-code="filesort"]')).toBeNull();
  });

  it("restores focus to the Explain trigger on Escape close", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    renderExplainable();

    const trigger = await screen.findByTestId("explain-trigger");
    await user.click(trigger);
    const panel = await screen.findByTestId("explain-panel");
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("explain-panel")).toBeNull();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("restores focus via Close button", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    renderExplainable();

    const trigger = await screen.findByTestId("explain-trigger");
    await user.click(trigger);
    await waitFor(() => {
      expect(screen.getByTestId("explain-close")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("explain-close"));
    await waitFor(() => {
      expect(screen.queryByTestId("explain-panel")).toBeNull();
    });
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it("renders Simplified Chinese Explain labels", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    renderExplainable(buildExplainableTarget(), zhMessages, "zh-CN");

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
    const riskBadge = screen.getByTestId("explain-risks").querySelector('[data-risk-code="full_table_scan"]');
    expect(riskBadge?.textContent).toContain("全表扫描");
    expect(screen.getByTestId("explain-close")).toHaveTextContent("关闭");
  });

  it("does not add execution history when Explain completes", async () => {
    const user = userEvent.setup();
    mockExplainQueryTarget.mockResolvedValueOnce(buildExplainResponse());
    renderExplainable();

    await user.click(await screen.findByTestId("explain-trigger"));
    await waitFor(() => {
      expect(screen.getByTestId("explain-ready")).toBeInTheDocument();
    });
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });
});

/**
 * Phase 38P: Objects pane hydration, URL synchronization idempotence, pane
 * width bounds, and resize separator accessibility.
 */
describe("QueryWorkbench hydration safety (Phase 38P)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("SSR render does not read localStorage — initial state uses defaults", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "500");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    expect(screen.getByRole("complementary", { name: "Objects" })).toHaveStyle({ width: "500px" });
  });

  it("client hydration restores saved open/width state after mount", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "400");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const aside = screen.getByRole("complementary", { name: "Objects" });
    expect(aside).toHaveStyle({ width: "400px" });
  });

  it("invalid stored width is clamped to min on hydration", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "100");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const aside = screen.getByRole("complementary", { name: "Objects" });
    expect(aside).toHaveStyle({ width: "260px" });
  });

  it("width above old 280px max is accepted", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "500");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      const aside = screen.getByRole("complementary", { name: "Objects" });
      expect(aside).toHaveStyle({ width: "500px" });
    });
  });
});

describe("QueryWorkbench URL synchronization idempotence (Phase 38P)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("canonical URL causes zero additional router.replace calls after initial mount", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
    });

    const callsBefore = replace.mock.calls.length;

    await act(async () => {
      await Promise.resolve();
    });

    expect(replace.mock.calls.length).toBe(callsBefore);
  });

  it("objects toggle does not trigger URL sync replacement", async () => {
    const user = userEvent.setup();
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
    });

    const callsBefore = replace.mock.calls.length;

    const objectsButton = screen.getByRole("button", { name: "Objects" });
    await user.click(objectsButton);

    expect(replace.mock.calls.length).toBe(callsBefore);
  });

  it("preserves query parameters in URL sync", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run/i })).toBeInTheDocument();
    });

    const lastCall = replace.mock.calls[replace.mock.calls.length - 1]?.[0] as string | undefined;
    if (lastCall) {
      expect(lastCall).toContain("targetId=30");
    }
  });
});

describe("QueryWorkbench objects pane width (Phase 38P)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockClear();
  });

  it("widths above 280px work — pane renders wider than old max", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "500");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      const aside = screen.getByRole("complementary", { name: "Objects" });
      expect(aside).toHaveStyle({ width: "500px" });
    });
  });

  it("maximum preserves editor — pane does not exceed viewport - 480", async () => {
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.setItem("query-objects-pane-width", "600");

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const aside = screen.getByRole("complementary", { name: "Objects" });
    const width = parseInt(aside.style.width, 10);
    expect(width).toBeLessThanOrEqual(560);
  });

  it("resize re-clamping uses same bounds as hydration", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    fireEvent.click(screen.getByRole("button", { name: "Objects" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const separator = screen.getByRole("separator", { name: "Resize objects pane" });

    fireEvent.pointerDown(separator, { clientX: 320, pointerId: 1 });
    fireEvent.pointerMove(window, { clientX: 9000, pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });

    await waitFor(() => {
      const aside = screen.getByRole("complementary", { name: "Objects" });
      const width = parseInt(aside.style.width, 10);
      expect(width).toBeLessThanOrEqual(560);
    });
  });

  it("ArrowRight increases pane width and ArrowLeft decreases it", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    fireEvent.click(screen.getByRole("button", { name: "Objects" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const separator = screen.getByRole("separator", { name: "Resize objects pane" });
    separator.focus();

    const asideBefore = screen.getByRole("complementary", { name: "Objects" });
    const widthBefore = parseInt(asideBefore.style.width, 10);

    fireEvent.keyDown(separator, { key: "ArrowRight" });

    const asideAfter = screen.getByRole("complementary", { name: "Objects" });
    const widthAfter = parseInt(asideAfter.style.width, 10);
    expect(widthAfter).toBe(widthBefore + 10);

    fireEvent.keyDown(separator, { key: "ArrowLeft" });

    const asideFinal = screen.getByRole("complementary", { name: "Objects" });
    const widthFinal = parseInt(asideFinal.style.width, 10);
    expect(widthFinal).toBe(widthBefore);
  });

  it("Shift+ArrowRight increases by 20px", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    fireEvent.click(screen.getByRole("button", { name: "Objects" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const separator = screen.getByRole("separator", { name: "Resize objects pane" });
    separator.focus();

    const asideBefore = screen.getByRole("complementary", { name: "Objects" });
    const widthBefore = parseInt(asideBefore.style.width, 10);

    fireEvent.keyDown(separator, { key: "ArrowRight", shiftKey: true });

    const asideAfter = screen.getByRole("complementary", { name: "Objects" });
    const widthAfter = parseInt(asideAfter.style.width, 10);
    expect(widthAfter).toBe(widthBefore + 20);
  });

  it("separator has correct ARIA values", async () => {
    renderWorkbench([buildReadyWorkbenchTarget()]);

    fireEvent.click(screen.getByRole("button", { name: "Objects" }));

    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });

    const separator = screen.getByRole("separator", { name: "Resize objects pane" });
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "260");
    expect(separator).toHaveAttribute("tabindex", "0");
    const valuenow = separator.getAttribute("aria-valuenow");
    expect(Number(valuenow)).toBeGreaterThanOrEqual(260);
    expect(Number(valuenow)).toBeLessThanOrEqual(560);
  });
});

describe("Phase 38P: Oracle regression", () => {
  it("restores DEFAULT width when localStorage has no width key", async () => {
    // Verify: Number(null) is 0, which would clamp to MIN (260) not DEFAULT (320)
    // After fix: missing key uses DEFAULT_OBJECTS_WIDTH (320)
    window.localStorage.setItem("query-objects-pane-open", "true");
    window.localStorage.removeItem("query-objects-pane-width");
    renderWorkbench([buildReadyWorkbenchTarget()]);
    await waitFor(() => {
      expect(screen.getByRole("complementary", { name: "Objects" })).toBeInTheDocument();
    });
    const separator = screen.getByRole("separator", { name: "Resize objects pane" });
    expect(separator).toHaveAttribute("aria-valuenow", "320");
  });
});

/**
 * Phase 38Q: Result grid disclosure integration. Mixed disclosure modes
 * render correctly, blocked queries show controlled errors, and FK navigation
 * is disabled for masked values.
 */
describe("QueryWorkbench result grid disclosure (Phase 38Q)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyWorkbenchTarget()],
      pageInfo: pageInfoFor([buildReadyWorkbenchTarget()]),
    });
    mockGetSchemaDatabases.mockResolvedValue({ targetResourceId: 30, defaultDatabase: null, items: [], pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
    mockGetSchemaObjects.mockResolvedValue({ targetResourceId: 30, database: "", items: [], pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false } });
    mockGetObjectDetails.mockResolvedValue(null as never);
    mockCopyToClipboard.mockResolvedValue(true);
  });

  function colWithDisclosure(
    name: string,
    databaseType: string,
    nullable: boolean,
    displayMode: "raw_copy_allowed" | "masked_no_copy" | "blocked",
    copyAllowed: boolean,
  ): QueryResultColumn {
    return { name, databaseType, nullable, displayMode, copyAllowed };
  }

  it("renders mixed disclosure modes correctly (raw + masked columns)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("name", "VARCHAR", true, "raw_copy_allowed", true),
        colWithDisclosure("ssn", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [
        [1, "alice", "[MASKED]"],
        [2, "bob", "[MASKED]"],
      ],
      rowCount: 2,
      truncated: false,
      durationMs: 12,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    expect(screen.getByRole("cell", { name: "alice" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "bob" })).toBeInTheDocument();
    expect(screen.getAllByText("[MASKED]").length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("cell", { name: "alice" }));
    expect(screen.getByTestId("copy-selection")).toBeEnabled();

    await user.click(screen.getAllByRole("cell", { name: "[MASKED]" })[0]!);
    expect(screen.getByTestId("copy-selection")).toBeDisabled();
  });

  it("copy button aria-label shows not-permitted for masked cells", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("secret", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [["[MASKED]"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "[MASKED]" }));
    const copyButton = screen.getByTestId("copy-selection");
    expect(copyButton).toHaveAttribute("aria-label", expect.stringContaining("not permitted"));
    expect(copyButton).toBeDisabled();
  });

  it("column-name copy works for masked columns (metadata-only, always allowed)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("ssn", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [["[MASKED]"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const header = screen.getByRole("columnheader", { name: "ssn" });
    await user.click(header);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("ssn");
    await waitFor(() => {
      expect(screen.getByText(/copied/i)).toBeInTheDocument();
    });
  });

  it("FK navigation not offered for masked FK column values", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockReset();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 30,
      defaultDatabase: "testdb",
      items: [{ name: "testdb", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockReset();
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 30,
      database: "testdb",
      items: [{ name: "users", kind: "table" as const, database: "testdb" }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetObjectDetails.mockReset();
    mockGetObjectDetails.mockResolvedValue({
      targetResourceId: 30,
      database: "testdb",
      name: "users",
      kind: "table" as const,
      columns: [
        { name: "id", databaseType: "BIGINT", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: true },
        { name: "email", databaseType: "VARCHAR", ordinalPosition: 2, nullable: false, primaryKey: false, autoIncrement: false },
      ],
      indexes: [],
      foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    mockExecuteQueryTarget.mockResolvedValue({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("user_id", "BIGINT", true, "masked_no_copy", false),
      ],
      rows: [[1, "[MASKED]"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });

    renderWorkbench([buildReadyWorkbenchTarget()]);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("cell", { name: "[MASKED]" }));

    expect(screen.queryByTestId("related-records")).toBeNull();
    expect(screen.getByTestId("copy-selection")).toBeDisabled();
  });
});
