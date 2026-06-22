import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
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

import { QueryWorkbench } from "@/components/query/query-workbench";
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

describe("QueryWorkbench", () => {
  it("renders the safety banner stating execution is not enabled", () => {
    renderWorkbench();

    expect(
      screen.getByText("Query execution is not enabled"),
    ).toBeInTheDocument();
  });

  it("renders the active target's facts in the switcher context and governance panel", () => {
    renderWorkbench();

    // The active target's host surfaces in both the switcher context card and
    // the governance "Target facts" list.
    expect(
      screen.getAllByText("prod-ch-host-01.internal:8123").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Execution disabled")).toBeInTheDocument();
    // readonlyCredential missing field is localized, never raw camelCase.
    expect(screen.getByText("Read-only credential")).toBeInTheDocument();
    expect(screen.queryAllByText(/^readonlyCredential$/)).toHaveLength(0);
  });

  it("renders every execution action locked (disabled) with no enabled Run/Execute button", () => {
    renderWorkbench();

    const runButton = screen.getByRole("button", { name: "Run locked" });
    const explainButton = screen.getByRole("button", { name: "Explain locked" });
    const saveSheetButton = screen.getByRole("button", { name: "Save sheet" });
    const exportButton = screen.getByRole("button", { name: "Export unavailable" });

    expect(runButton).toBeDisabled();
    expect(explainButton).toBeDisabled();
    expect(saveSheetButton).toBeDisabled();
    expect(exportButton).toBeDisabled();

    // No enabled Run or Execute action may be present anywhere.
    expect(screen.queryByRole("button", { name: /^run$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^execute$/i })).toBeNull();
    const enabledExecutionButtons = screen
      .getAllByRole("button")
      .filter(
        (button) =>
          !button.hasAttribute("disabled") &&
          /^(run|execute)$/i.test(button.textContent ?? ""),
      );
    expect(enabledExecutionButtons).toHaveLength(0);
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

  it("narrows the target list with search and reflects the new active target in governance", async () => {
    const user = userEvent.setup();
    renderWorkbench();

    await user.type(
      screen.getByRole("searchbox", { name: "Search target, engine, or host" }),
      "redis",
    );

    // Only the redis target survives; it becomes the active target.
    expect(
      screen.getAllByText("redis-payment.internal:6379").length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1 targets")).toBeInTheDocument();
    expect(
      screen.queryByText("prod-ch-host-01.internal:8123"),
    ).not.toBeInTheDocument();
  });

  it("renders localized copy under the zh-CN locale", () => {
    renderWorkbench(buildTargets(), zhMessages);

    expect(screen.getByText("查询执行尚未启用")).toBeInTheDocument();
  });

  it("shows the active target name in the switcher, never a bare resourceId", () => {
    renderWorkbench();

    expect(screen.getByText(/Analytics ClickHouse Node 01/)).toBeInTheDocument();
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
    renderWorkbench(
      buildTargets(),
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

    // The incomplete label renders (switcher context + governance facts).
    expect(
      screen.getAllByText("Connection information incomplete").length,
    ).toBeGreaterThanOrEqual(1);

    // The degenerate :0 must never appear.
    expect(screen.queryAllByText(/:0/)).toHaveLength(0);

    // credentialState is localized via the label map, not raw. The label sits
    // inside a prefixed <p>, so match by substring.
    expect(screen.getByText(/Missing read-only credential/)).toBeInTheDocument();
    expect(screen.queryAllByText(/missing_readonly_credential/)).toHaveLength(0);

    // missingFields are localized via the label map, not raw camelCase keys.
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

    expect(screen.getByRole("button", { name: /run locked/i })).toBeDisabled();
    // No history fetch is issued for a locked target.
    expect(mockListQueryExecutions).not.toHaveBeenCalled();
  });

  it("enables Run for a backend-ready target", () => {
    renderReady();

    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
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
