import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResultColumn } from "@/types/query-execution";

vi.mock("next/navigation", () => ({
  usePathname: () => "/query",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/components/query/sql-code-editor", () => ({
  SqlCodeEditor: ({
    value,
    onChange,
    onRun,
    ariaLabel,
    disabled,
    themePreference,
    height,
  }: {
    value: string;
    onChange: (v: string) => void;
    onRun?: () => void;
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
import { EMPTY_FILTERS } from "@/lib/query-target-display";
import {
  executeQueryTarget,
  listQueryExecutions,
  navigateRelatedRecords,
} from "@/services/query-executions";
import { getQueryTargets } from "@/services/query-targets";
import { getSchemaDatabases, getSchemaObjects, getObjectDetails } from "@/services/query-schema";
import { buildQueryTarget, type DeepPartial } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type { QueryExecuteResponse, QueryExecutionCursorPage } from "@/types/query-execution";
import enMessages from "@/messages/en.json";

const mockExecuteQueryTarget = vi.mocked(executeQueryTarget);
const mockListQueryExecutions = vi.mocked(listQueryExecutions);
const mockGetQueryTargets = vi.mocked(getQueryTargets);
const mockNavigateRelatedRecords = vi.mocked(navigateRelatedRecords);
const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);

function emptyHistory(): QueryExecutionCursorPage {
  return {
    items: [],
    nextCursor: null,
  };
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

describe("ExecuteResult mixed-version response boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("normalizes legacy rows:null with rowCount:0 to empty grid", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: null as unknown as QueryExecuteResponse["rows"],
        rowCount: 0,
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/0 rows/).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders empty grid columns when rows:null is normalized", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: null as unknown as QueryExecuteResponse["rows"],
        rowCount: 0,
        columns: [
          { name: "id", databaseType: "BIGINT", nullable: false },
          { name: "email", databaseType: "VARCHAR", nullable: true },
        ],
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/0 rows/).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows controlled error for malformed rows (non-array)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: "not-an-array" as unknown as QueryExecuteResponse["rows"],
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/rows is not an array/)).toBeInTheDocument();
  });

  it("shows controlled error for invalid columns (non-array)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        columns: null as unknown as QueryExecuteResponse["columns"],
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/columns is not an array/)).toBeInTheDocument();
  });

  it("shows controlled error for row count mismatch", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: [[1, "a"]],
        rowCount: 5,
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/row count mismatch/)).toBeInTheDocument();
  });

  it("shows controlled error for rows:null with non-zero rowCount", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: null as unknown as QueryExecuteResponse["rows"],
        rowCount: 3,
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/rows is null with non-zero rowCount/)).toBeInTheDocument();
  });

  it("shows controlled error for column missing name", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        columns: [{ name: "", databaseType: "INT", nullable: false }],
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/column missing name/)).toBeInTheDocument();
  });

  it("renders valid response unchanged (no false positives)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({
        rows: [[42, "test-value"]],
        rowCount: 1,
      }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByText("test-value")).toBeInTheDocument();
    });
    expect(screen.getByText(/1 rows/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Phase 38P: Oracle regression — related-record panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("shows controlled error for malformed zero-row related-record response", async () => {
    // Verify: rowCount=0 with malformed columns must show error, not empty state
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({ rows: [], rowCount: 0, columns: "invalid" as unknown as QueryResultColumn[] }),
    );
    renderReady();
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows controlled error for malformed navigateRelatedRecords response via FK path", async () => {
    // Verify: navigateRelatedRecords returning malformed columns shows error
    // in RelatedRecordsPanel (line 1812), not empty text.
    const user = userEvent.setup();

    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 30,
      defaultDatabase: "testdb",
      items: [{ name: "testdb", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 30,
      database: "testdb",
      items: [{ name: "orders", kind: "table" as const, database: "testdb" }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetObjectDetails.mockResolvedValue({
      targetResourceId: 30,
      database: "testdb",
      name: "orders",
      kind: "table" as const,
      columns: [
        { name: "id", databaseType: "BIGINT", nullable: false },
        { name: "user_id", databaseType: "BIGINT", nullable: true },
      ],
      indexes: [],
      foreignKeys: [{
        name: "fk_user_id",
        columns: ["user_id"],
        referencedDatabase: "testdb",
        referencedObject: "users",
        referencedColumns: ["id"],
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      }],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    mockExecuteQueryTarget.mockResolvedValue(
      buildExecuteResponse({
        columns: [
          { name: "id", databaseType: "BIGINT", nullable: false },
          { name: "user_id", databaseType: "BIGINT", nullable: true },
        ],
        rows: [[1, 42]],
        rowCount: 1,
      }),
    );

    mockNavigateRelatedRecords.mockResolvedValue({
      executionId: 2001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: "invalid" as unknown as QueryResultColumn[],
      rows: [],
      rowCount: 0,
      truncated: false,
      durationMs: 5,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
      sourceDatabase: "testdb",
      sourceObject: "orders",
      foreignKey: "fk_user_id",
      referencedDatabase: "testdb",
      referencedObject: "users",
      referencedColumns: ["id"],
    });

    // Given: Objects pane with FK-capable table and preview provenance
    renderReady();
    await user.click(screen.getByRole("button", { name: "Objects" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "testdb" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "testdb" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "orders" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "orders" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Preview rows" })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Preview rows" }));

    // When: run preview, select FK cell, invoke related-record navigation
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("cell", { name: "42" }));
    await waitFor(() => {
      expect(screen.getByTestId("related-records")).toBeInTheDocument();
    });
    await user.click(screen.getByTestId("related-records"));
    await waitFor(() => {
      expect(screen.getByText(/fk_user_id/)).toBeInTheDocument();
    });
    await user.click(screen.getByText(/fk_user_id/));

    // Then: error text appears, NOT empty text
    await waitFor(() => {
      expect(screen.getByText("Could not load related records.")).toBeInTheDocument();
    });
    expect(screen.queryByText("No related records found.")).toBeNull();
  });
});
