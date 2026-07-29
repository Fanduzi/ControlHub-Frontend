import type { ResultDisclosureMode } from "@/types/query-disclosure";
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResultColumn } from "@/types/query-execution";
import { QueryExecuteError } from "@/services/query-executions";

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
import { copyToClipboard } from "@/lib/clipboard";
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
          col("id", "BIGINT", false),
          col("email", "VARCHAR", true),
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
        columns: [col("", "INT", false)],
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
        { name: "id", databaseType: "BIGINT", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: true },
        { name: "user_id", databaseType: "BIGINT", ordinalPosition: 2, nullable: true, primaryKey: false, autoIncrement: false },
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
          col("id", "BIGINT", false),
          col("user_id", "BIGINT", true),
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

/**
 * Phase 38Q: Result grid disclosure behavior. The server decides whether a
 * column is raw_copy_allowed, masked_no_copy, or blocked. The frontend renders
 * the server's decision without client-side masking logic.
 */
describe("QueryWorkbench result grid disclosure (Phase 38Q)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
    vi.mocked(copyToClipboard).mockResolvedValue(true);
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

  it("raw_copy_allowed cell can be copied (existing behavior preserved)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "raw_copy_allowed", true),
      ],
      rows: [["alice@example.com"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const cell = screen.getByRole("cell", { name: "alice@example.com" });
    await user.click(cell);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("alice@example.com");
  });

  it("masked_no_copy cell shows [MASKED] value and copy button is disabled", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("email", "VARCHAR", true, "masked_no_copy", false),
      ],
      rows: [
        [1, "[MASKED]"],
      ],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const maskedCell = screen.getByRole("cell", { name: "[MASKED]" });
    await user.click(maskedCell);

    expect(screen.getByTestId("copy-selection")).toBeDisabled();
  });

  it("masked value is NOT in aria-label, clipboard call, or toast", async () => {
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
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const cell = screen.getByRole("cell", { name: "[MASKED]" });
    await user.click(cell);

    const copyButton = screen.getByTestId("copy-selection");
    expect(copyButton).toHaveAttribute("aria-label", expect.stringContaining("not permitted"));
    expect(copyButton).toBeDisabled();

    expect(mockCopyToClipboard).not.toHaveBeenCalled();
  });

  it("column-name copy still works regardless of disclosure mode", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "masked_no_copy", false),
      ],
      rows: [["[MASKED]"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const header = screen.getByRole("columnheader", { name: "email" });
    await user.click(header);
    await user.click(screen.getByTestId("copy-selection"));

    expect(mockCopyToClipboard).toHaveBeenCalledWith("email");
  });

  it("keyboard navigation still works for masked cells", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("secret", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [
        [1, "[MASKED]"],
        [2, "[MASKED]"],
      ],
      rowCount: 2,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const firstCell = screen.getByRole("cell", { name: "1" });
    await user.click(firstCell);

    await user.keyboard("{ArrowRight}");
    expect(document.activeElement).toHaveTextContent("[MASKED]");

    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toHaveTextContent("[MASKED]");

    await user.keyboard("{ArrowLeft}");
    expect(document.activeElement).toHaveTextContent("2");

    await user.keyboard("{ArrowUp}");
    expect(document.activeElement).toHaveTextContent("1");
  });

  it("focus restoration works after selecting a masked cell", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("secret", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [
        [1, "[MASKED]"],
      ],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const maskedCell = screen.getByRole("cell", { name: "[MASKED]" });
    await user.click(maskedCell);
    expect(maskedCell).toHaveAttribute("data-selected");

    const idCell = screen.getByRole("cell", { name: "1" });
    await user.click(idCell);
    expect(idCell).toHaveAttribute("data-selected");
    expect(screen.getByTestId("copy-selection")).toBeEnabled();
  });

  it("shows controlled error for unknown disclosure mode", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "unknown_mode" as "raw_copy_allowed", true),
      ],
      rows: [["alice@example.com"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/unknown disclosure mode/i)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows controlled error for blocked column in successful response", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "blocked", false),
      ],
      rows: [["alice@example.com"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/blocked column/i)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows controlled error for raw_copy_allowed with copyAllowed=false", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "raw_copy_allowed", false),
      ],
      rows: [["alice@example.com"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/copyAllowed/i)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows controlled error for masked_no_copy with copyAllowed=true", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("email", "VARCHAR", true, "masked_no_copy", true),
      ],
      rows: [["[MASKED]"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/copyAllowed/i)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows controlled error for masked_no_copy with non-masked value", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("secret", "VARCHAR", false, "masked_no_copy", false),
      ],
      rows: [["RAW_SECRET_VALUE"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/non-masked value/i)).toBeInTheDocument();
    expect(screen.queryByText(/RAW_SECRET_VALUE/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("shows controlled error for row width mismatch", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        colWithDisclosure("id", "BIGINT", false, "raw_copy_allowed", true),
        colWithDisclosure("email", "VARCHAR", true, "raw_copy_allowed", true),
      ],
      rows: [[1]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/row width/i)).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("rejects empty displayMode (metadata query bypass removed)", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [
        { name: "col1", databaseType: "VARCHAR", nullable: false, displayMode: "" as unknown as ResultDisclosureMode, copyAllowed: false },
      ],
      rows: [["value"]],
      rowCount: 1,
      truncated: false,
      durationMs: 10,
      limitApplied: 100,
      executedAt: "2026-07-23T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    // Empty displayMode is now rejected as unknown.
    expect(screen.getByText(/unknown disclosure mode/i)).toBeInTheDocument();
    expect(screen.queryByText(/value/)).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

});

describe("QueryWorkbench disclosure error rendering (Phase 38Q repair)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("disclosure_blocked error shows localized title but not raw server message", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(403, "query_result_disclosure_blocked", "SIMULATED_RAW_SERVER_MESSAGE_SHOULD_NOT_APPEAR"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/Query blocked by result disclosure policy/i)).toBeInTheDocument();
    expect(screen.queryByText(/SIMULATED_RAW_SERVER_MESSAGE_SHOULD_NOT_APPEAR/i)).not.toBeInTheDocument();
  });

  it("non-disclosure error still shows detail message", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockRejectedValueOnce(
      new QueryExecuteError(502, "query_backend_error", "target database query failed"),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    expect(screen.getByText(/Target database error/i)).toBeInTheDocument();
    expect(screen.getByText(/target database query failed/i)).toBeInTheDocument();
  });
});

// ─── Phase 38S: Governed result paging UX contract ────────────────────────

describe("Phase 38S: paging controls in result panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("renders page-size selector with values [10, 25, 50, 100]", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
       rowCount: 2,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const pageSizeTrigger = screen.getByRole("combobox", { name: /page size/i });
    expect(pageSizeTrigger).toBeInTheDocument();

    await user.click(pageSizeTrigger);
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "10" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "25" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "50" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "100" })).toBeInTheDocument();
    });
  });

  it("renders Next page button enabled when hasMore=true", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
       rowCount: 2,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const nextButton = screen.getByRole("button", { name: /next page/i });
    expect(nextButton).toBeEnabled();
  });

  it("renders Next page button disabled when hasMore=false", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      rowCount: 2,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const nextButton = screen.getByRole("button", { name: /next page/i });
    expect(nextButton).toBeDisabled();
  });

  it("renders Previous page button disabled on page 1", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
       rowCount: 2,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const prevButton = screen.getByRole("button", { name: /previous page/i });
    expect(prevButton).toBeDisabled();
  });

  it("clicking Next sends the next page with the same statement and max rows", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
       rowCount: 2,
         pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
      } as QueryExecuteResponse)
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
       rowCount: 2,
         pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: false },
      } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[1]!;
    expect(request).toMatchObject({
      statement: "select 1",
      maxRows: 10,
      pagination: { page: 2, pageSize: 10 },
    });
  });

  it("page-size change resets to page 1 and re-executes", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
       rowCount: 2,
         pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
      } as QueryExecuteResponse)
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
       rowCount: 2,
         pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
      } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const pageSizeTrigger = screen.getByRole("combobox", { name: /page size/i });
    await user.click(pageSizeTrigger);
    await user.click(screen.getByRole("option", { name: "10" }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[1]!;
    expect(request).toMatchObject({
      maxRows: 10,
      pagination: { page: 1, pageSize: 10 },
    });
    expect(request).not.toHaveProperty("cursor");
  });

  it("paging controls are NOT rendered for metadata responses", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [{ name: "table_name", databaseType: "VARCHAR", nullable: false, displayMode: "raw_copy_allowed", copyAllowed: true }],
      rows: [["orders"]],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
      limitApplied: 100,
      executedAt: "2026-07-29T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /next page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /previous page/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /page size/i })).not.toBeInTheDocument();
  });

  it("stale response is rejected when requestId does not match latest request", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });

    mockExecuteQueryTarget
      .mockReturnValueOnce(firstPromise as ReturnType<typeof executeQueryTarget>)
      .mockResolvedValueOnce({
         ...buildExecuteResponse(),
         rows: [[99, "fresh-data"]],
         rowCount: 1,
         pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
      } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    const statementInput = screen.getByRole("textbox");
    await user.clear(statementInput);
    await user.type(statementInput, "select 2");
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(screen.getByText("fresh-data")).toBeInTheDocument();
    });

    resolveFirst({
      ...buildExecuteResponse(),
      rows: [[42, "stale-data"]],
      rowCount: 1,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);

    await waitFor(() => {
      expect(screen.queryByText("stale-data")).not.toBeInTheDocument();
    });
    expect(screen.getByText("fresh-data")).toBeInTheDocument();
  });

  it("does NOT mutate SQL or slice rows client-side for paging", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      rowCount: 2,
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[0]!;
    const body = request as { statement: string };
    expect(body.statement).not.toMatch(/\bLIMIT\b/i);
    expect(body.statement).not.toMatch(/\bOFFSET\b/i);
  });
});

describe("Phase 38S: paging reset triggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("changing statement resets paging to page 1", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      ...buildExecuteResponse(),
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const statementInput = screen.getByRole("textbox");
    await user.clear(statementInput);
    await user.type(statementInput, "select * from different_table");
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[1]!;
    expect(request.pagination).toEqual({ page: 1, pageSize: 10 });
    expect(request).not.toHaveProperty("cursor");
  });

  it("changing maxRows resets paging to page 1", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      ...buildExecuteResponse(),
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "50");
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[1]!;
    expect(request.pagination).toEqual({ page: 1, pageSize: 10 });
    expect(request).not.toHaveProperty("cursor");
  });
});

describe("Phase 38S: DDL is read-only highlighted CodeMirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("DDL statement renders in a read-only CodeMirror editor, not a plain pre", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      executionId: 1001,
      status: "success",
      targetResourceId: 30,
      engine: "mysql",
      columns: [{ name: "Create Table", databaseType: "TEXT", nullable: false, displayMode: "raw_copy_allowed", copyAllowed: true }],
      rows: [["CREATE TABLE orders (\n  id BIGINT PRIMARY KEY\n);"]],
      rowCount: 1,
      truncated: false,
      durationMs: 5,
      limitApplied: 100,
      executedAt: "2026-07-29T10:00:00Z",
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const ddlCell = screen.getByRole("cell", { name: /CREATE TABLE/i });
    await user.click(ddlCell);

    await waitFor(() => {
      const codeMirror = document.querySelector(".cm-editor");
      expect(codeMirror).toBeInTheDocument();
      expect(codeMirror).toHaveAttribute("aria-readonly", "true");
    });

    expect(screen.queryByRole("button", { name: /^run$/i })).toBeDisabled();
  });
});
