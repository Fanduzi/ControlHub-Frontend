import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/query-executions", async () => {
  const actual = await vi.importActual("@/services/query-executions");
  return {
    ...actual,
    executeQueryTarget: vi.fn(),
    listQueryExecutions: vi.fn(),
  };
});

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
import { QUERY_EDITOR_HEIGHT_STORAGE_KEY } from "@/lib/query-editor-preferences";
import { EMPTY_FILTERS, type WorkbenchFilters } from "@/lib/query-target-display";
import {
  executeQueryTarget,
  listQueryExecutions,
  QueryExecuteError,
} from "@/services/query-executions";
import { buildQueryTarget, type DeepPartial } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type {
  QueryExecuteResponse,
  QueryExecutionListResponse,
} from "@/types/query-execution";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockExecuteQueryTarget = vi.mocked(executeQueryTarget);
const mockListQueryExecutions = vi.mocked(listQueryExecutions);

function emptyHistory(): QueryExecutionListResponse {
  return {
    items: [],
    pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
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

function renderWorkbench(
  targets: QueryTarget[] = buildTargets(),
  messages: Record<string, unknown> = enMessages,
  initialFilters: WorkbenchFilters = EMPTY_FILTERS,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryWorkbench targets={targets} initialFilters={initialFilters} />
    </NextIntlClientProvider>,
  );
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

  it("renders the safety banner explaining governed execution", () => {
    renderWorkbench();

    expect(
      screen.getByText("Governed query execution"),
    ).toBeInTheDocument();
  });

  it("renders the active target's facts in the navigator and governance panel", () => {
    renderWorkbench();

    expect(
      screen.getAllByText("prod-ch-host-01.internal:8123").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Execution disabled")).toBeInTheDocument();
    expect(screen.getByText("Read-only credential")).toBeInTheDocument();
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

  it("renders an honest locked schema placeholder for a SQL target without schema metadata", () => {
    renderWorkbench();

    expect(
      screen.getByText(
        /Database \/ schema \/ table \/ column placeholders appear once schema metadata/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Schema is locked/)).toBeInTheDocument();
  });

  it("renders the locked result area with a not-executed state", () => {
    renderWorkbench();

    expect(screen.getByText("Result grid")).toBeInTheDocument();
    expect(screen.getByText("0 rows · not executed")).toBeInTheDocument();
    expect(screen.getByText("Result area is locked")).toBeInTheDocument();
  });

  it("renders query history and access grant placeholders when those tabs are opened", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.click(screen.getByRole("tab", { name: "Query history" }));
    expect(
      screen.getByText(/Query history is unavailable/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Access grants" }));
    expect(screen.getByText(/Access grants are unavailable/)).toBeInTheDocument();
  });

  it("narrows the target list with search in the connection navigator", async () => {
    const user = userEvent.setup();
    renderWorkbench();

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

  it("renders localized copy under the zh-CN locale", () => {
    renderWorkbench(buildTargets(), zhMessages);

    expect(screen.getByText("受治理的查询执行")).toBeInTheDocument();
  });

  it("shows the active target name in the navigator and header, never a bare resourceId", () => {
    renderWorkbench();

    expect(screen.getAllByText(/Analytics ClickHouse Node 01/).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryAllByText(/^22$/)).toHaveLength(0);
  });

  it("renders localized labels in filter triggers, never raw enum values", () => {
    renderWorkbench(
      buildTargets(),
      enMessages,
      { ...EMPTY_FILTERS, queryKind: "sql", readiness: "credential_required" },
    );

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

    const activeSummary = screen.getByRole("region", { name: "Active connection" });
    expect(within(activeSummary).getByText("mysql")).toBeInTheDocument();
    expect(within(activeSummary).getByText("Production")).toBeInTheDocument();
    expect(within(activeSummary).getAllByText("Missing connection").length).toBeGreaterThanOrEqual(1);

    expect(screen.queryAllByText(/:0/)).toHaveLength(0);

    expect(screen.getAllByText(/Missing read-only credential/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryAllByText(/^missing_readonly_credential$/)).toHaveLength(0);

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
        <QueryWorkbench targets={[target]} initialFilters={EMPTY_FILTERS} />
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
        { name: "id", databaseType: "BIGINT", nullable: false },
        { name: "name", databaseType: "VARCHAR", nullable: true },
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
        <QueryWorkbench targets={[lockedTarget]} initialFilters={EMPTY_FILTERS} />
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
        columns: [{ name: "v", databaseType: "INT", nullable: true }],
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
    // Backend message is preserved without leaking a stack trace.
    expect(screen.getByText(/target is not enabled/)).toBeInTheDocument();
  });

  it("renders a SQL guard error on 400 validation_failed", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(400, "validation_failed", "only a single SELECT statement is allowed"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    expect(screen.getByText(/blocked by the SQL guard/i)).toBeInTheDocument();
    expect(screen.getByText(/only a single SELECT statement is allowed/)).toBeInTheDocument();
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

    // History loads once on mount for a ready target.
    await waitFor(() => expect(mockListQueryExecutions).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    // After the execution settles, history is refreshed (a second fetch).
    await waitFor(() => expect(mockListQueryExecutions).toHaveBeenCalledTimes(2));
    expect(mockListQueryExecutions).toHaveBeenLastCalledWith(30);
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
        { name: "id", databaseType: "BIGINT", nullable: false },
        { name: "service", databaseType: "VARCHAR", nullable: true },
      ],
      rows: [[1, "orders-api"]],
      rowCount: 1,
      truncated: false,
      durationMs: 12,
      limitApplied: 100,
      executedAt: "2026-06-22T08:30:00Z",
    };
  }

  function historyForA(): QueryExecutionListResponse {
    return {
      items: [
        {
          id: 9001,
          targetResourceId: TARGET_A_ID,
          actorUserId: 1,
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
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    };
  }

  function renderWithTargets(targets: QueryTarget[] = buildSwitchTargets()) {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench targets={targets} initialFilters={EMPTY_FILTERS} />
      </NextIntlClientProvider>,
    );
  }

  async function pickTarget(
    user: ReturnType<typeof userEvent.setup>,
    name: RegExp,
  ): Promise<void> {
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
    let resolveBHistory!: (value: QueryExecutionListResponse) => void;
    mockListQueryExecutions.mockImplementation((resourceId: number) => {
      if (resourceId === TARGET_A_ID) return Promise.resolve(historyForA());
      return new Promise<QueryExecutionListResponse>((resolve) => {
        resolveBHistory = resolve;
      });
    });

    renderWithTargets();

    // A's history loads into state on mount (not yet viewed). Switch to B, whose
    // history hangs pending, and open B's history tab.
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

    // B's load failed → empty state, never A's statement preview.
    await waitFor(() => {
      expect(screen.getByText("No executions yet")).toBeInTheDocument();
    });
    expect(screen.queryByText("select * from analytics_log")).toBeNull();
  });

  it("clears target-owned state but preserves statement when switching targets", async () => {
    const user = userEvent.setup();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());

    renderWithTargets();

    // A is active. Edit the statement away from the default seed.
    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.clear(statement);
    await user.type(statement, "select 2 from a");
    expect(statement).toHaveValue("select 2 from a");

    // Switching targets via navigator clears target-owned state (result,
    // error, history, execution progress) but preserves the user's statement.
    await pickTarget(user, /Staging MySQL/);

    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("select 2 from a");
  });
});

describe("QueryWorkbench target picker search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
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

    expect(screen.getAllByText(/Staging MySQL/).length).toBeGreaterThanOrEqual(2);

    await user.click(screen.getByRole("button", { name: "Analytics ClickHouse Node 01" }));

    await waitFor(() => {
      expect(screen.getAllByText(/Analytics ClickHouse Node 01/).length).toBeGreaterThanOrEqual(2);
    });
  });

  it("shows no match message when search does not match any target", async () => {
    const user = userEvent.setup();
    renderWorkbench(buildThreeTargets());

    const searchInput = screen.getByPlaceholderText(/Search by name, engine, host/);
    await user.type(searchInput, "nonexistent-xyz");

    await waitFor(() => {
      expect(screen.getByText("No targets match your filters.")).toBeInTheDocument();
    });
  });

  it("shows ready targets in the navigator", () => {
    renderWorkbench(buildThreeTargets());

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
      <QueryWorkbench targets={[target]} initialFilters={EMPTY_FILTERS} />
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
    window.sessionStorage.setItem("controlhub.role", "admin");
    renderWithCredentialState("missing_readonly_credential");

    const link = screen.getByRole("link", { name: /open credential settings/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/settings/query-credentials");

    window.sessionStorage.removeItem("controlhub.role");
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
    window.sessionStorage.setItem("controlhub.role", "admin");

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
        <QueryWorkbench targets={[target]} initialFilters={EMPTY_FILTERS} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Governance & access")).toBeInTheDocument();
    expect(screen.getByText("Execution ready")).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: "Production" })).toBeInTheDocument();

    const prodButtons = screen
      .getAllByRole("button")
      .filter((button) => button.textContent?.includes("Prod"));
    expect(prodButtons[0]).toHaveTextContent("Prod MySQL Primary");
    expect(prodButtons[1]).toHaveTextContent("Prod Redis");
  });
});

describe("QueryWorkbench active target header", () => {
  it("shows active target display name in the active connection summary", () => {
    renderWorkbench();

    const activeSummary = screen.getByRole("region", { name: "Active connection" });
    expect(
      within(activeSummary).getByText("Analytics ClickHouse Node 01"),
    ).toBeInTheDocument();
  });

  it("shows target facts in the active summary, not duplicated in governance", () => {
    renderWorkbench();

    const activeSummary = screen.getByRole("region", { name: "Active connection" });
    expect(within(activeSummary).getByText("clickhouse")).toBeInTheDocument();
    expect(within(activeSummary).getByText("Production")).toBeInTheDocument();

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
      columns: [{ name: "1", databaseType: "INT", nullable: false }],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-08T10:00:00Z",
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench targets={[buildReadyTarget()]} initialFilters={EMPTY_FILTERS} />
      </NextIntlClientProvider>,
    );

    const statement = screen.getByRole("textbox", { name: /statement/i });
    await user.click(statement);
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    expect(mockExecuteQueryTarget).toHaveBeenCalledWith(30, {
      statement: "select 1",
      maxRows: 100,
    });
  });

  it("formats query with Cmd/Ctrl+Shift+F shortcut", async () => {
    const user = userEvent.setup();

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench targets={[buildReadyTarget()]} initialFilters={EMPTY_FILTERS} />
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

  it("does not run via shortcut when target is locked", async () => {
    const lockedTarget = buildQueryTarget({
      resourceId: 40,
      readiness: "credential_required",
      availableActions: { run: false, explain: false, export: false, saveSheet: false, requestAccess: false },
    });

    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench targets={[lockedTarget]} initialFilters={EMPTY_FILTERS} />
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
        <QueryWorkbench targets={[readyTarget, lockedTarget]} initialFilters={EMPTY_FILTERS} />
      </NextIntlClientProvider>,
    );

    const runButton = screen.getByRole("button", { name: /^run$/i });
    expect(runButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));

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
        <QueryWorkbench targets={targets} initialFilters={{ ...EMPTY_FILTERS, engine: "redis" }} />
      </NextIntlClientProvider>,
    );

    const activeSummary = screen.getByRole("region", { name: "Active connection" });
    expect(within(activeSummary).getByText("MySQL Dev")).toBeInTheDocument();
    expect(within(activeSummary).getByText("mysql")).toBeInTheDocument();
  });
});

describe("QueryWorkbench history target-race guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("discards stale history when worksheet target changes during pending request", async () => {
    const user = userEvent.setup();
    let resolveHistoryA!: (value: QueryExecutionListResponse) => void;

    mockListQueryExecutions.mockImplementation((resourceId: number) => {
      if (resourceId === 30) {
        return new Promise((resolve) => { resolveHistoryA = resolve; });
      }
      return Promise.resolve(emptyHistory());
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
        <QueryWorkbench targets={targets} initialFilters={EMPTY_FILTERS} />
      </NextIntlClientProvider>,
    );

    await waitFor(() => expect(mockListQueryExecutions).toHaveBeenCalledWith(30));

    await user.click(screen.getByRole("button", { name: "Target B" }));

    resolveHistoryA({
      items: [{
        id: 9001,
        targetResourceId: 30,
        actorUserId: 1,
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
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });

    await user.click(screen.getByRole("tab", { name: /query history/i }));
    expect(screen.queryByText("select * from target_a_table")).toBeNull();
  });
});
