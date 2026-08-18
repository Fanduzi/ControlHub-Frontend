// input: @testing-library/react, @/components/query/query-workbench, mocked services
// output: Vitest component tests for QueryEditorShell (template mode, lifecycle disposal, target switch, execution routing)
// pos: unit-level behavioral tests for the query editor shell component
// note: if this file changes, update header and tests/components/README.md
import type { ResultDisclosureMode } from "@/types/query-disclosure";
import { NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueryResultColumn } from "@/types/query-execution";
import { QueryExecuteError } from "@/services/query-executions";
import { DEFAULT_QUERY_MAX_ROWS } from "@/lib/query-editor-preferences";
import * as querySqlFormat from "@/lib/query-sql-format";

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

vi.mock("@/services/query-saved-statements", () => ({
  listSavedStatements: vi.fn(),
  createSavedStatement: vi.fn(),
  updateSavedStatement: vi.fn(),
  deleteSavedStatement: vi.fn(),
  executeSavedStatementTemplate: vi.fn(),
  SavedStatementError: class SavedStatementError extends Error {},
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
import { listSavedStatements, executeSavedStatementTemplate } from "@/services/query-saved-statements";
import { buildQueryTarget, type DeepPartial } from "@/tests/fixtures/query-targets";
import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type { QueryExecuteResponse, QueryExecutionCursorPage } from "@/types/query-execution";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockExecuteQueryTarget = vi.mocked(executeQueryTarget);
const mockListQueryExecutions = vi.mocked(listQueryExecutions);
const mockGetQueryTargets = vi.mocked(getQueryTargets);
const mockNavigateRelatedRecords = vi.mocked(navigateRelatedRecords);
const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);
const mockListSavedStatements = vi.mocked(listSavedStatements);
const mockExecuteSavedStatementTemplate = vi.mocked(executeSavedStatementTemplate);
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
    window.localStorage.clear();
    mockExecuteQueryTarget.mockReset();
    mockListQueryExecutions.mockReset();
    mockGetQueryTargets.mockReset();
    mockListSavedStatements.mockReset();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
    mockListSavedStatements.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
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
      maxRows: 100,
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
    await user.click(await screen.findByRole("option", { name: "25" }));

    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[1]!;
    expect(request).toMatchObject({
      maxRows: 100,
      pagination: { page: 1, pageSize: 25 },
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

  it("loading a saved statement invalidates a pending Run response", async () => {
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });

    mockExecuteQueryTarget.mockReturnValueOnce(firstPromise as ReturnType<typeof executeQueryTarget>);
    mockListSavedStatements.mockResolvedValueOnce({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Fresh statement",
        statement: "select fresh_data",
        scope: "personal",
        parameters: [],
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load fresh statement/i }));

    resolveFirst({
      ...buildExecuteResponse(),
      rows: [[42, "stale-data"]],
      rowCount: 1,
       pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);

    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));
    await waitFor(() => {
      expect(screen.queryByText("stale-data")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("select fresh_data");
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
  });

  it("clears parameter values when returning to a worksheet", async () => {
    const user = userEvent.setup();
    mockListSavedStatements.mockResolvedValueOnce({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Parameterized statement",
        statement: "select :status",
        scope: "personal",
        parameters: [{ name: "status", type: "string" }],
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
    renderReady();

    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load parameterized statement/i }));
    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));

    const parameterInput = screen.getByLabelText("status value");
    await user.type(parameterInput, "secret-value");
    await user.click(screen.getByRole("button", { name: "Add worksheet" }));
    await user.click(screen.getByRole("tab", { name: /Worksheet 1/ }));

    expect(screen.getByLabelText("status value")).toHaveValue("");
  });

  it("localizes loaded parameter value labels", async () => {
    const user = userEvent.setup();
    mockListSavedStatements.mockResolvedValueOnce({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Parameterized statement",
        statement: "select :status",
        scope: "personal",
        parameters: [{ name: "status", type: "string" }],
        createdAt: "2026-07-29T00:00:00Z",
        updatedAt: "2026-07-29T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
    renderReady(buildReadyTarget(), zhMessages, "zh-CN");

    await user.click(screen.getByRole("tab", { name: /已保存脚本/i }));
    await user.click(await screen.findByRole("button", { name: /加载 Parameterized statement/i }));
    await user.click(screen.getByRole("tab", { name: /^Worksheet$/i }));

    expect(screen.getByLabelText("status 参数值")).toBeInTheDocument();
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
    window.localStorage.clear();
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

describe("Phase 38S repair: maxRows default and persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("runs with default maxRows 100 so the default page size can page forward", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(100);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[0]!;
    expect(request).toMatchObject({
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
  });

  it("persists a changed maxRows to localStorage", async () => {
    const user = userEvent.setup();
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "250");

    expect(window.localStorage.getItem("controlhub.query.max-rows")).toBe("250");
  });

  it("restores the persisted maxRows on mount and sends it with Run", async () => {
    window.localStorage.setItem("controlhub.query.max-rows", "250");
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await waitFor(() => {
      expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(250);
    });

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });

    const [, request] = mockExecuteQueryTarget.mock.calls[0]!;
    expect(request).toMatchObject({ maxRows: 250 });
  });
});

describe("Phase 38S repair: worksheet-scoped pageSize and in-flight invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("worksheet A keeps pageSize 10 after worksheet B switches to 50", async () => {
    // Regression: pageSize must be per-worksheet state, not shell-global.
    // A executed at pageSize 10; B changes to 50; back on A, Next page must
    // send page 2 with pageSize 10 — B's choice must not leak into A.
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);

    renderReady();

    // Worksheet A: run at default pageSize 10.
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    // Worksheet B: run, then change page size to 50.
    await user.click(screen.getByRole("button", { name: /add worksheet/i }));
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 50, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    await user.click(screen.getByRole("combobox", { name: /page size/i }));
    await user.click(await screen.findByRole("option", { name: "50" }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(3);
    });
    const [, bRequest] = mockExecuteQueryTarget.mock.calls[2]!;
    expect(bRequest.pagination).toEqual({ page: 1, pageSize: 50 });

    // Back to worksheet A: Next page must still use A's pageSize 10.
    await user.click(screen.getByRole("tab", { name: "Worksheet 1" }));
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: false },
    } as QueryExecuteResponse);
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(4);
    });

    const [, aNextRequest] = mockExecuteQueryTarget.mock.calls[3]!;
    expect(aNextRequest.pagination).toEqual({ page: 2, pageSize: 10 });
  });

  it("changing maxRows invalidates a pending Run response", async () => {
    // Contract: editing maxRows mid-flight swaps the worksheet requestId so
    // the stale response is dropped instead of rendering under new settings.
    const user = userEvent.setup();
    let resolveFirst!: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
    mockExecuteQueryTarget.mockReturnValueOnce(firstPromise as ReturnType<typeof executeQueryTarget>);

    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "50");

    resolveFirst({
      ...buildExecuteResponse(),
      rows: [[42, "stale-data"]],
      rowCount: 1,
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
    });
    expect(screen.queryByText("stale-data")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });
});

describe("Phase 38U: explicit max-rows validation blocks execution for invalid drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
  });

  it("clearing the input shows an error, disables Run, and fires zero execute calls", async () => {
    const user = userEvent.setup();
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    await user.clear(maxRowsInput);

    expect(maxRowsInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("entering 501 shows an error, disables Run, and fires zero execute calls", async () => {
    const user = userEvent.setup();
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    fireEvent.change(maxRowsInput, { target: { value: "501" } });

    await waitFor(() => {
      expect(maxRowsInput).toHaveAttribute("aria-invalid", "true");
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("invalid maxRows blocks every result paging execution path", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: true },
    } as QueryExecuteResponse);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    fireEvent.change(maxRowsInput, { target: { value: "501" } });

    expect(maxRowsInput).toHaveValue(501);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: /page size/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /previous page/i }));
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await user.click(screen.getByRole("combobox", { name: /page size/i }));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem("controlhub.query.max-rows")).toBeNull();
    expect(screen.getByText(/Page 2/)).toBeInTheDocument();
  });

  it("same-value correction from 501 to 100 resets paging and rejects stale responses", async () => {
    const user = userEvent.setup();
    let resolveNext!: (value: QueryExecuteResponse) => void;
    const pendingNext = new Promise<QueryExecuteResponse>((resolve) => {
      resolveNext = resolve;
    });
    mockExecuteQueryTarget
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
        pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
      } as QueryExecuteResponse)
      .mockReturnValueOnce(pendingNext);
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("grid")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(2);
    });

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    fireEvent.change(maxRowsInput, { target: { value: "501" } });
    fireEvent.change(maxRowsInput, { target: { value: "100" } });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(maxRowsInput).toHaveValue(100);
    expect(window.localStorage.getItem("controlhub.query.max-rows")).toBe("100");
    expect(screen.queryByTestId("result-paging")).not.toBeInTheDocument();

    resolveNext({
      ...buildExecuteResponse({ rows: [[2, "stale-page-2"]], rowCount: 1 }),
      pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: false },
    } as QueryExecuteResponse);
    await waitFor(() => {
      expect(screen.queryByText("stale-page-2")).not.toBeInTheDocument();
    });

    mockExecuteQueryTarget.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    } as QueryExecuteResponse);
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(3);
    });
    const [, request] = mockExecuteQueryTarget.mock.calls[2]!;
    expect(request).toMatchObject({
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
  });

  it.each(["0", "-1", "2.5", "abc"])("invalid draft %s shows an error and disables Run", (raw) => {
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    fireEvent.change(maxRowsInput, { target: { value: raw } });

    expect(maxRowsInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    if (raw === "2.5") {
      expect(screen.getByRole("alert")).toHaveTextContent(
        /^Enter a whole number from 1 to 500$/,
      );
    }
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
  });

  it("valid boundary values 1 and 500 are executable", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });

    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "1");
    expect(maxRowsInput).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();

    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "500");
    expect(maxRowsInput).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
  });

  it("correcting from invalid to valid persists, clears error, and resets to page 1", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: false },
    } as QueryExecuteResponse);
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "501");
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();

    await user.clear(maxRowsInput);
    await user.type(maxRowsInput, "250");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(maxRowsInput).not.toHaveAttribute("aria-invalid");
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });
    const [, request] = mockExecuteQueryTarget.mock.calls[0]!;
    expect(request.maxRows).toBe(250);
    expect(request.pagination).toEqual({ page: 1, pageSize: 10 });
  });

  it("keyboard Run shortcut is blocked while the draft is invalid", async () => {
    const user = userEvent.setup();
    renderReady();

    const editor = screen.getByRole("textbox", { name: /statement/i });
    await user.clear(screen.getByRole("spinbutton", { name: /max rows/i }));
    await user.type(editor, "SELECT 1");

    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("resynchronizes an invalid draft when switching worksheets", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValue(buildExecuteResponse());
    renderReady();

    const maxRowsInput = screen.getByRole("spinbutton", { name: /max rows/i });
    fireEvent.change(maxRowsInput, { target: { value: "501" } });
    expect(maxRowsInput).toHaveValue(501);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));
    expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(100);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Worksheet 1" }));
    expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(100);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });
  });

  it("initial and newly-created worksheets share the single exported default", async () => {
    const user = userEvent.setup();
    renderReady();

    expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(
      DEFAULT_QUERY_MAX_ROWS,
    );

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));

    expect(screen.getByRole("spinbutton", { name: /max rows/i })).toHaveValue(
      DEFAULT_QUERY_MAX_ROWS,
    );
  });
});

// ─── Phase P1: Loaded template parameter form ─────────────────────────────

describe("Phase P1: loaded template parameter form rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
    mockListSavedStatements.mockResolvedValue({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Param template",
        statement: "SELECT * FROM orders WHERE status = :status AND id > :min_id",
        scope: "personal" as const,
        parameters: [
          { name: "status", type: "string" as const },
          { name: "min_id", type: "integer" as const },
        ],
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
  });

  it("renders typed parameter form after loading a statement with declarations", async () => {
    const user = userEvent.setup();
    renderReady();

    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load param template/i }));

    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));

    expect(screen.getByText("Parameters")).toBeInTheDocument();
    const statusInput = screen.getByLabelText("status value");
    expect(statusInput).toBeInTheDocument();
    expect(statusInput.tagName).toBe("INPUT");

    const minIdInput = screen.getByLabelText("min_id value");
    expect(minIdInput).toBeInTheDocument();
    expect(minIdInput).toHaveAttribute("type", "number");
  });

  it("does not render parameter form when loaded statement has no declarations", async () => {
    mockListSavedStatements.mockResolvedValueOnce({
      items: [{
        id: 99,
        targetResourceId: 30,
        name: "Static query",
        statement: "SELECT 1",
        scope: "personal" as const,
        parameters: [],
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
    const user = userEvent.setup();
    renderReady();

    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load static query/i }));

    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));

    expect(screen.queryByText("Parameters")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("SELECT 1");
  });

  it("loading a statement with parameters clears stale result and error", async () => {
    const user = userEvent.setup();
    mockExecuteQueryTarget.mockResolvedValueOnce(
      buildExecuteResponse({ rows: [[42, "stale-data"]], rowCount: 1 }),
    );
    renderReady();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByText("stale-data")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load param template/i }));

    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));
    expect(screen.queryByText("stale-data")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
    // Template mode with empty values: Run stays disabled until values are entered.
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
  });

  it("loading a saved statement does not fire execute, explain, or schema requests", async () => {
    const user = userEvent.setup();
    renderReady();

    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load param template/i }));

    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));

    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue(
      "SELECT * FROM orders WHERE status = :status AND id > :min_id",
    );
  });
});

describe("Phase 38W-3: template execution through the governed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mockExecuteSavedStatementTemplate.mockReset();
    mockListQueryExecutions.mockResolvedValue(emptyHistory());
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget()],
      pageInfo: pageInfoFor([buildReadyTarget()]),
    });
    mockListSavedStatements.mockResolvedValue({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Param template",
        statement: "SELECT * FROM orders WHERE status = :status AND id > :min_id",
        scope: "personal" as const,
        parameters: [
          { name: "status", type: "string" as const },
          { name: "min_id", type: "integer" as const },
        ],
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
  });

  async function loadTemplate(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("tab", { name: /saved sheets/i }));
    await user.click(await screen.findByRole("button", { name: /load param template/i }));
    await user.click(screen.getByRole("tab", { name: /^Worksheet$/ }));
  }

  async function fillTemplateValues(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("status value"), "paid");
    await user.type(screen.getByLabelText("min_id value"), "5");
  }

  it("runs a loaded template through the saved-statement execute route with typed values", async () => {
    mockExecuteSavedStatementTemplate.mockResolvedValueOnce(buildExecuteResponse());
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    await fillTemplateValues(user);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledTimes(1);
    });
    expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledWith(
      30,
      42,
      expect.objectContaining({
        values: { status: "paid", min_id: 5 },
        pagination: { page: 1, pageSize: 10 },
      }),
    );
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("stays disabled until every required value is entered", async () => {
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);

    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
    await user.type(screen.getByLabelText("status value"), "paid");
    expect(screen.getByRole("button", { name: /^run$/i })).toBeDisabled();
    await user.type(screen.getByLabelText("min_id value"), "5");
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
  });

  it("hides Explain in template mode so placeholder SQL never reaches the explain route", async () => {
    const user = userEvent.setup();
    renderReady(buildReadyTarget({
      availableActions: { run: true, explain: true, export: false, saveSheet: false, requestAccess: false },
    }));
    await loadTemplate(user);

    expect(screen.queryByRole("button", { name: /explain/i })).not.toBeInTheDocument();

    // Exiting template mode (by editing SQL) restores the Explain control.
    const editor = screen.getByRole("textbox", { name: /statement/i });
    await user.type(editor, " WHERE 1 = 1");
    expect(screen.getByRole("button", { name: /explain/i })).toBeEnabled();
  });

  it("editing the SQL exits template mode and restores the ordinary run route", async () => {
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();

    const editor = screen.getByRole("textbox", { name: /statement/i });
    await user.type(editor, " WHERE 1 = 1");
    expect(screen.queryByText("Template mode")).not.toBeInTheDocument();

    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });
    expect(mockExecuteSavedStatementTemplate).not.toHaveBeenCalled();
  });

  it("pages a template through the saved-statement execute route", async () => {
    mockExecuteSavedStatementTemplate
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
        pagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
      })
      .mockResolvedValueOnce({
        ...buildExecuteResponse(),
        pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: false },
      });
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await waitFor(() => {
      expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledTimes(2);
    });
    expect(mockExecuteSavedStatementTemplate).toHaveBeenLastCalledWith(
      30,
      42,
      expect.objectContaining({
        values: { status: "paid", min_id: 5 },
        pagination: { page: 2, pageSize: 10 },
      }),
    );
    expect(mockExecuteQueryTarget).not.toHaveBeenCalled();
  });

  it("shows localized accessible field errors and retains entered values", async () => {
    mockExecuteSavedStatementTemplate.mockRejectedValueOnce(
      new QueryExecuteError(400, "validation_failed", "template parameter validation failed", {
        status: "invalid",
      }),
    );
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    await user.click(screen.getByRole("button", { name: /^run$/i }));

    const statusInput = screen.getByLabelText("status value");
    await waitFor(() => {
      expect(screen.getByText("Value does not match the expected type")).toBeInTheDocument();
    });
    expect(statusInput).toHaveAttribute("aria-invalid", "true");
    expect(statusInput).toHaveAttribute("aria-describedby");
    // Entered values are retained after the controlled execution error.
    expect(statusInput).toHaveValue("paid");
    expect(screen.getByLabelText("min_id value")).toHaveValue(5);

    // Editing the value clears the field error and the generic error panel.
    await user.clear(statusInput);
    await user.type(statusInput, "pending");
    expect(screen.queryByText("Value does not match the expected type")).not.toBeInTheDocument();
    expect(statusInput).not.toHaveAttribute("aria-invalid");
  });

  it("drops stale template responses after a value change", async () => {
    let resolveFirst!: (value: QueryExecuteResponse) => void;
    mockExecuteSavedStatementTemplate.mockReturnValueOnce(
      new Promise<QueryExecuteResponse>((resolve) => { resolveFirst = resolve; }),
    );
    mockExecuteSavedStatementTemplate.mockResolvedValueOnce(
      buildExecuteResponse({ rows: [[7, "latest"]], rowCount: 1 }),
    );
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledTimes(1);
    });

    // Changing a value invalidates the in-flight template run.
    await user.clear(screen.getByLabelText("min_id value"));
    await user.type(screen.getByLabelText("min_id value"), "9");
    resolveFirst(buildExecuteResponse({ rows: [[1, "stale"]], rowCount: 1 }));

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(screen.getByText("latest")).toBeInTheDocument();
    });
    expect(screen.queryByText("stale")).not.toBeInTheDocument();
  });

  it("editing SQL exits template mode, clears values, invalidates stale response, and restores ordinary Run", async () => {
    // WHY: template mode must not linger after a real SQL edit; values and
    // in-flight template results are worksheet-memory only and must die with
    // the session so ordinary POST /execute cannot run placeholder SQL.
    let resolveFirst!: (value: QueryExecuteResponse) => void;
    mockExecuteSavedStatementTemplate.mockReturnValueOnce(
      new Promise<QueryExecuteResponse>((resolve) => { resolveFirst = resolve; }),
    );
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    expect(
      screen.getByText(/Run executes the saved template\. Editing the SQL exits template mode\./i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /close template session/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledTimes(1);
    });

    // Editor is disabled while executing; drive the same onChange path the
    // SQL editor uses so requestId rotation still drops the in-flight result.
    const editor = screen.getByRole("textbox", { name: /statement/i });
    fireEvent.change(editor, {
      target: { value: `${(editor as HTMLTextAreaElement).value} WHERE 1 = 1` },
    });

    expect(screen.queryByText("Template mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("status value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("min_id value")).not.toBeInTheDocument();

    resolveFirst(buildExecuteResponse({ rows: [[1, "stale-after-sql-edit"]], rowCount: 1 }));
    await waitFor(() => {
      expect(screen.queryByText("stale-after-sql-edit")).not.toBeInTheDocument();
    });

    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });
    expect(mockExecuteSavedStatementTemplate).toHaveBeenCalledTimes(1);
  });

  it("clears template values on worksheet switch; returning keeps the session with empty values", async () => {
    // WHY: departing worksheet values must die on switch so a shared device
    // cannot recover prior template input by flipping tabs. The loaded
    // template session may remain, but entered values must stay empty.
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    expect(screen.getByLabelText("status value")).toHaveValue("paid");
    expect(screen.getByLabelText("min_id value")).toHaveValue(5);

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));
    expect(screen.queryByText("Template mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("status value")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Worksheet 1/ }));
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    expect(screen.getByLabelText("status value")).toHaveValue("");
    expect(screen.getByLabelText("min_id value")).toHaveValue(null);
  });

  it("closing a non-last worksheet destroys its template session", async () => {
    // WHY: "template close" means closing the worksheet — the close path must
    // destroy session state so the loaded template cannot reappear.
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add worksheet/i }));
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Worksheet 2/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /Close Worksheet 1/i }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: /^Close worksheet$/i }));

    await waitFor(() => {
      expect(screen.queryByRole("tab", { name: /Worksheet 1/ })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Template mode")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("status value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("min_id value")).not.toBeInTheDocument();
  });

  it("renders template-mode field errors in zh-CN", async () => {
    // The backend re-reads the latest template; a declaration added after the
    // form rendered surfaces a per-field "missing" error.
    mockExecuteSavedStatementTemplate.mockRejectedValueOnce(
      new QueryExecuteError(400, "validation_failed", "template parameter validation failed", {
        status: "missing",
      }),
    );
    const user = userEvent.setup();
    renderReady(buildReadyTarget(), zhMessages, "zh-CN");
    await user.click(screen.getByRole("tab", { name: /已保存脚本/i }));
    await user.click(await screen.findByRole("button", { name: /加载 param template/i }));
    await user.click(screen.getByRole("tab", { name: /^Worksheet$/i }));
    await user.type(screen.getByLabelText("status 参数值"), "paid");
    await user.type(screen.getByLabelText("min_id 参数值"), "5");
    await user.click(screen.getByRole("button", { name: /^执行$/i }));

    await waitFor(() => {
      expect(screen.getByText("此字段为必填项")).toBeInTheDocument();
    });
  });

  it("formatting that changes SQL exits template mode and clears values", async () => {
    // WHY: a successful format rewrite is a real SQL edit and must exit
    // template mode the same way a manual edit does.
    const formatSpy = vi.spyOn(querySqlFormat, "formatQueryStatement").mockReturnValue({
      ok: true,
      formatted: "SELECT 1 AS formatted",
    });
    const user = userEvent.setup();
    renderReady();
    await loadTemplate(user);
    await fillTemplateValues(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    expect(screen.getByLabelText("status value")).toHaveValue("paid");

    await user.click(screen.getByRole("button", { name: /format/i }));

    await waitFor(() => {
      expect(screen.queryByText("Template mode")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("status value")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /statement/i })).toHaveValue("SELECT 1 AS formatted");
    formatSpy.mockRestore();
  });

  it("target switch creates a clean non-template worksheet and cannot restore old values", async () => {
    // WHY: target switch must activate a fresh worksheet; prior template values
    // live only in the departing worksheet memory and must not resurface.
    const secondTarget = buildReadyTarget({
      resourceId: 31,
      displayName: "Remote MySQL",
      connectionContext: {
        engine: "mysql",
        host: "10.0.0.1",
        port: 3306,
        environment: "Production",
        owner: "Platform",
        clusterName: "",
      },
    });
    mockGetQueryTargets.mockResolvedValue({
      items: [buildReadyTarget(), secondTarget],
      pageInfo: pageInfoFor([buildReadyTarget(), secondTarget]),
    });
    mockListSavedStatements.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });
    const user = userEvent.setup();
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryWorkbench
          targets={[buildReadyTarget(), secondTarget]}
          pageInfo={pageInfoFor([buildReadyTarget(), secondTarget])}
          initialFilters={EMPTY_FILTERS}
        />
      </NextIntlClientProvider>,
    );

    // Restore the template list for the original target load path.
    mockListSavedStatements.mockResolvedValue({
      items: [{
        id: 42,
        targetResourceId: 30,
        name: "Param template",
        statement: "SELECT * FROM orders WHERE status = :status AND id > :min_id",
        scope: "personal" as const,
        parameters: [
          { name: "status", type: "string" as const },
          { name: "min_id", type: "integer" as const },
        ],
        createdAt: "2026-08-01T00:00:00Z",
        updatedAt: "2026-08-01T00:00:00Z",
      }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      canManageSharedTemplates: false,
    });

    await loadTemplate(user);
    await fillTemplateValues(user);
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    expect(screen.getByLabelText("status value")).toHaveValue("paid");

    await user.click(screen.getByRole("button", { name: /^open connections$/i }));
    const dialog = screen.getByRole("dialog", { name: /connections/i });
    await user.click(within(dialog).getByRole("button", { name: "Remote MySQL" }));

    await waitFor(() => {
      expect(screen.queryByText("Template mode")).not.toBeInTheDocument();
    });
    expect(screen.queryByLabelText("status value")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("min_id value")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();

    mockExecuteQueryTarget.mockResolvedValueOnce(buildExecuteResponse());
    await user.click(screen.getByRole("button", { name: /^run$/i }));
    await waitFor(() => {
      expect(mockExecuteQueryTarget).toHaveBeenCalledTimes(1);
    });
    expect(mockExecuteSavedStatementTemplate).not.toHaveBeenCalled();

    // Target switch creates Worksheet 2; return to the departing Worksheet 1
    // sheet tab (not the section "Worksheet" content tab).
    await user.click(screen.getByRole("tab", { name: /Worksheet 1/ }));
    expect(screen.getByText("Template mode")).toBeInTheDocument();
    expect(screen.getByLabelText("status value")).toHaveValue("");
    expect(screen.getByLabelText("min_id value")).toHaveValue(null);
  });

  describe("Phase 38X-4: Schema Metadata Identity isolation", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockListQueryExecutions.mockResolvedValue(emptyHistory());
      mockGetQueryTargets.mockResolvedValue({
        items: [buildReadyTarget()],
        pageInfo: pageInfoFor([buildReadyTarget()]),
      });
    });

    const dbList = (defaultDatabase: string | null, names: string[]) => ({
      targetResourceId: 30,
      defaultDatabase,
      items: names.map((name) => ({ name, isDefault: name === defaultDatabase })),
      pageInfo: { page: 1, pageSize: 100, totalItems: names.length, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    const objects = (database: string) => ({
      targetResourceId: 30,
      database,
      items: [{ database, name: "orders", kind: "table" as const }],
      pageInfo: { page: 1, pageSize: 500, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    it("issues exactly one database-list request to supply default and completion", async () => {
      mockGetSchemaDatabases.mockResolvedValue(dbList("appdb", ["appdb"]));
      mockGetSchemaObjects.mockResolvedValue(objects("appdb"));
      renderReady();
      // The applied default drives an object fetch for that database.
      await waitFor(() => {
        expect(mockGetSchemaObjects).toHaveBeenCalledWith(30, expect.objectContaining({ database: "appdb" }));
      });
      // Default selection and database completions come from a single request.
      expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
    });

    it("does not auto-select a database on null default and object completion waits", async () => {
      mockGetSchemaDatabases.mockResolvedValue(dbList(null, ["appdb", "otherdb"]));
      mockGetSchemaObjects.mockResolvedValue(objects("appdb"));
      renderReady();
      await waitFor(() => {
        expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
      });
      // Without an explicit selection the object load waits for a database.
      expect(mockGetSchemaObjects).not.toHaveBeenCalled();
    });

    it("shows a non-blocking retryable warning and keeps Run available on metadata failure", async () => {
      const user = userEvent.setup();
      mockGetSchemaDatabases.mockRejectedValueOnce(new Error("boom"));
      renderReady();
      await waitFor(() => {
        expect(screen.getByTestId("metadata-warning")).toBeInTheDocument();
      });
      expect(screen.getByRole("alert")).toHaveTextContent("Schema metadata is unavailable");
      // Editor and Run stay usable with keyword-only completion.
      expect(screen.getByRole("button", { name: /^run$/i })).toBeEnabled();
      mockGetSchemaDatabases.mockResolvedValue(dbList("appdb", ["appdb"]));
      await user.click(screen.getByRole("button", { name: /retry metadata/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("metadata-warning")).not.toBeInTheDocument();
      });
    });

    it("Retry reloads databases and objects together for the current identity", async () => {
      const user = userEvent.setup();
      mockGetSchemaDatabases.mockResolvedValue(dbList("appdb", ["appdb"]));
      mockGetSchemaObjects.mockRejectedValueOnce(new Error("boom"));
      renderReady();
      await waitFor(() => {
        expect(screen.getByTestId("metadata-warning")).toBeInTheDocument();
      });
      const dbCalls = mockGetSchemaDatabases.mock.calls.length;
      const objectCalls = mockGetSchemaObjects.mock.calls.length;
      await user.click(screen.getByRole("button", { name: /retry metadata/i }));
      await waitFor(() => {
        expect(screen.queryByTestId("metadata-warning")).not.toBeInTheDocument();
      });
      expect(mockGetSchemaDatabases.mock.calls.length).toBeGreaterThan(dbCalls);
      expect(mockGetSchemaObjects.mock.calls.length).toBeGreaterThan(objectCalls);
    });

    it("rejects a stale database-list response after a target change", async () => {
      const secondTarget = buildReadyTarget({
        resourceId: 31,
        displayName: "Remote MySQL",
        connectionContext: { engine: "mysql", host: "10.0.0.1", port: 3306, environment: "Production", owner: "Platform", clusterName: "" },
      });
      mockGetQueryTargets.mockResolvedValue({
        items: [buildReadyTarget(), secondTarget],
        pageInfo: pageInfoFor([buildReadyTarget(), secondTarget]),
      });
      let resolveStale!: (value: unknown) => void;
      mockGetSchemaDatabases
        .mockReturnValueOnce(
          new Promise<unknown>((resolve) => { resolveStale = resolve; }) as ReturnType<typeof getSchemaDatabases>,
        )
        .mockResolvedValue(dbList(null, ["remotedb"]));
      mockGetSchemaObjects.mockResolvedValue(objects("appdb"));
      const user = userEvent.setup();
      render(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <QueryWorkbench
            targets={[buildReadyTarget(), secondTarget]}
            pageInfo={pageInfoFor([buildReadyTarget(), secondTarget])}
            initialFilters={EMPTY_FILTERS}
          />
        </NextIntlClientProvider>,
      );
      // Switch target so the first target's in-flight db-list is stale.
      await user.click(screen.getByRole("button", { name: /^open connections$/i }));
      const dialog = screen.getByRole("dialog", { name: /connections/i });
      await user.click(within(dialog).getByRole("button", { name: "Remote MySQL" }));
      await waitFor(() => {
        expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(2);
      });
      mockGetSchemaObjects.mockClear();
      resolveStale(dbList("staleDb", ["staleDb"]));
      await new Promise((r) => setTimeout(r, 20));
      // The stale response must not trigger any object fetch for a prior identity.
      expect(mockGetSchemaObjects).not.toHaveBeenCalled();
    });

    it("shares metadata across same-identity worksheets without duplicate requests", async () => {
      const user = userEvent.setup();
      mockGetSchemaDatabases.mockResolvedValue(dbList("appdb", ["appdb"]));
      mockGetSchemaObjects.mockResolvedValue(objects("appdb"));
      renderReady();
      await waitFor(() => {
        expect(mockGetSchemaObjects).toHaveBeenCalledWith(30, expect.objectContaining({ database: "appdb" }));
      });
      const dbCalls = mockGetSchemaDatabases.mock.calls.length;
      const objectCalls = mockGetSchemaObjects.mock.calls.length;
      await user.click(screen.getByRole("button", { name: /add worksheet/i }));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /Worksheet 2/ })).toHaveAttribute("aria-selected", "true");
      });
      // The sibling worksheet reuses the loaded metadata: no duplicate request.
      expect(mockGetSchemaDatabases.mock.calls.length).toBe(dbCalls);
      expect(mockGetSchemaObjects.mock.calls.length).toBe(objectCalls);
    });
  });
});
