// input: QueryObjectInspector, real ApiError instances, localized messages, and mocked schema services
// output: definition error, retry, localization, and no-leakage coverage
// pos: Vitest/Testing Library tests for the query object inspector surface
// note: if this file changes, update this header and module README.md.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const SQL_KEYWORDS = /\b(CREATE|TABLE|INT|PRIMARY|KEY|AUTO_INCREMENT|VARCHAR|NOT|NULL|DEFAULT|INDEX|UNIQUE|ENGINE|CHARSET)\b/;

vi.mock("@uiw/react-codemirror", async () => {
  const { createElement: h } = await vi.importActual<typeof import("react")>("react");

  return {
    default: function MockCodeMirror({ value, readOnly, editable }: {
      value?: string;
      readOnly?: boolean;
      editable?: boolean;
      extensions?: unknown[];
    }) {
      const isReadOnly = readOnly === true || editable === false;
      const hasKeywords = SQL_KEYWORDS.test(value ?? "");
      return h("div", {
        className: "cm-editor",
        ...(isReadOnly ? { "aria-readonly": "true" } : {}),
      },
        h("div", { className: "cm-scroller" },
          h("div", { className: "cm-content", role: "textbox" },
            h("span", { className: "cm-line" }, value ?? ""),
            hasKeywords ? h("span", { className: "cm-keyword", "aria-hidden": "true" }) : null,
          ),
        ),
      );
    },
  };
});

vi.mock("@/services/query-schema", () => ({
  getObjectDetails: vi.fn(),
  getSchemaDatabases: vi.fn(),
  getSchemaObjects: vi.fn(),
  getTableDefinition: vi.fn(),
}));

import { QueryObjectExplorer } from "@/components/query/query-object-explorer";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects, getTableDefinition } from "@/services/query-schema";
import { ApiError } from "@/services/api-client";
import type { ObjectDetailResponse } from "@/types/query-schema";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh-CN.json";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);
const mockGetTableDefinition = vi.mocked(getTableDefinition);

function buildDetail(overrides: Partial<ObjectDetailResponse> = {}): ObjectDetailResponse {
  return {
    targetResourceId: 1,
    database: "test_db",
    name: "test_table",
    kind: "table",
    columns: [
      { name: "id", databaseType: "bigint", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: true },
      { name: "name", databaseType: "varchar(255)", ordinalPosition: 2, nullable: true, primaryKey: false, autoIncrement: false },
    ],
    indexes: [
      { name: "PRIMARY", columns: ["id"], unique: true, primary: true },
      { name: "idx_name", columns: ["name"], unique: false, primary: false },
    ],
    foreignKeys: [
      {
        name: "fk_test_ref",
        columns: ["ref_id"],
        referencedDatabase: "other_db",
        referencedObject: "ref_table",
        referencedColumns: ["id"],
        onUpdate: "RESTRICT",
        onDelete: "CASCADE",
      },
    ],
    truncated: { columns: false, indexes: false, foreignKeys: false },
    ...overrides,
  };
}

function renderExplorer(targetId = 1, locale = "en") {
  const onPreviewRequest = vi.fn();
  const messages = locale === "zh-CN" ? zhMessages : enMessages;
  const result = render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <QueryObjectExplorer
        targetId={targetId}
        store={new QuerySchemaStore()}
        onPreviewRequest={onPreviewRequest}
      />
    </NextIntlClientProvider>,
  );
  return {
    onPreviewRequest,
    ...result,
    rerenderWithTarget: (newTargetId: number) =>
      result.rerender(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <QueryObjectExplorer
            targetId={newTargetId}
            store={new QuerySchemaStore()}
            onPreviewRequest={onPreviewRequest}
          />
        </NextIntlClientProvider>,
      ),
  };
}

async function openInspector(detail: ObjectDetailResponse = buildDetail(), locale = "en") {
  mockGetSchemaDatabases.mockResolvedValue({
    targetResourceId: 1,
    defaultDatabase: "test_db",
    items: [{ name: "test_db", isDefault: true }],
    pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  });
  mockGetSchemaObjects.mockResolvedValue({
    targetResourceId: 1,
    database: "test_db",
    items: [{ database: "test_db", name: "test_table", kind: "table" }],
    pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
  });
  mockGetObjectDetails.mockResolvedValue(detail);

  renderExplorer(1, locale);

  const user = userEvent.setup();
  const dbButton = await screen.findByRole("button", { name: "test_db" });
  await user.click(dbButton);

  const tableButton = await screen.findByRole("button", { name: "test_table" });
  await user.click(tableButton);

  const inspectButton = await screen.findByRole("button", {
    name: locale === "zh-CN" ? "检查" : "Inspect",
  });
  await user.click(inspectButton);

  return { user };
}

describe("QueryObjectInspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders columns, indexes, and foreign keys from loaded detail", async () => {
    await openInspector();

    expect(screen.getByText("test_table — Inspector")).toBeVisible();

    const columnsSection = screen.getByLabelText("Columns");
    expect(within(columnsSection).getByText("id")).toBeVisible();
    expect(within(columnsSection).getByText("name")).toBeVisible();
    expect(within(columnsSection).getByText("varchar(255)")).toBeVisible();

    const indexesSection = screen.getByLabelText("Indexes");
    expect(within(indexesSection).getByText("PRIMARY")).toBeVisible();
    expect(within(indexesSection).getByText("idx_name")).toBeVisible();

    const fkSection = screen.getByLabelText("Foreign Keys");
    expect(within(fkSection).getByText("fk_test_ref")).toBeVisible();
    expect(within(fkSection).getByText("other_db")).toBeVisible();
    expect(within(fkSection).getByText("ref_table")).toBeVisible();
    expect(within(fkSection).getByText("CASCADE")).toBeVisible();
  });

  it("shows empty notices when arrays are empty", async () => {
    const detail = buildDetail({
      columns: [],
      indexes: [],
      foreignKeys: [],
    });
    await openInspector(detail);

    expect(screen.getByText("No columns found.")).toBeVisible();
    expect(screen.getByText("No indexes found.")).toBeVisible();
    expect(screen.getByText("No foreign keys found.")).toBeVisible();
  });

  it("shows truncation notices independently per section", async () => {
    const detail = buildDetail({
      truncated: { columns: true, indexes: false, foreignKeys: true },
    });
    await openInspector(detail);

    const truncatedNotices = screen.getAllByTestId("inspector-truncated");
    expect(truncatedNotices).toHaveLength(2);
    expect(truncatedNotices[0]).toHaveTextContent("Column list may be incomplete.");
    expect(truncatedNotices[1]).toHaveTextContent("Foreign key list may be incomplete.");
  });

  it("does not issue a second getObjectDetails call when Inspector opens", async () => {
    const detail = buildDetail();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1,
      defaultDatabase: "test_db",
      items: [{ name: "test_db", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      items: [{ database: "test_db", name: "test_table", kind: "table" }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetObjectDetails.mockResolvedValue(detail);

    renderExplorer();
    const user = userEvent.setup();

    const dbButton = await screen.findByRole("button", { name: "test_db" });
    await user.click(dbButton);
    const tableButton = await screen.findByRole("button", { name: "test_table" });
    await user.click(tableButton);
    await screen.findByText("Inspect");

    const callsAfterDetail = mockGetObjectDetails.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await screen.findByText("test_table — Inspector");

    expect(mockGetObjectDetails.mock.calls.length).toBe(callsAfterDetail);
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const { user } = await openInspector();

    const inspector = screen.getByText("test_table — Inspector");
    expect(inspector).toBeVisible();

    await user.keyboard("{Escape}");

    expect(screen.queryByText("test_table — Inspector")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveFocus();
  });

  it("close button has localized accessible name 'Close inspector'", async () => {
    await openInspector();

    const closeButton = screen.getByRole("button", { name: "Close inspector" });
    expect(closeButton).toBeVisible();
  });

  it("focuses trigger element even if component re-renders", async () => {
    const { user } = await openInspector();

    await user.keyboard("{Escape}");

    const inspectButton = screen.getByRole("button", { name: "Inspect" });
    expect(inspectButton).toHaveFocus();
  });

  it("renders primary key and auto-increment badges with text labels", async () => {
    await openInspector();

    const yesBadges = screen.getAllByText("Yes");
    expect(yesBadges.length).toBeGreaterThan(0);

    const noBadges = screen.getAllByText("No");
    expect(noBadges.length).toBeGreaterThan(0);
  });

  it("preserves API column order without re-sorting", async () => {
    const detail = buildDetail({
      columns: [
        { name: "z_col", databaseType: "int", ordinalPosition: 3, nullable: false, primaryKey: false, autoIncrement: false },
        { name: "a_col", databaseType: "int", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: false },
        { name: "m_col", databaseType: "int", ordinalPosition: 2, nullable: true, primaryKey: false, autoIncrement: false },
      ],
      indexes: [],
      foreignKeys: [],
    });
    await openInspector(detail);

    const columnsSection = screen.getByLabelText("Columns");
    const cells = within(columnsSection).getAllByText(/_col$/);
    expect(cells[0]).toHaveTextContent("z_col");
    expect(cells[1]).toHaveTextContent("a_col");
    expect(cells[2]).toHaveTextContent("m_col");
  });

  it("targetId rerender while Inspector open: closes Inspector, unmounts old trigger, clears old metadata", async () => {
    mockGetSchemaDatabases.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: "test_db",
      items: [{ name: "test_db", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    }).mockResolvedValueOnce({
      targetResourceId: 2,
      defaultDatabase: "other_db",
      items: [{ name: "other_db", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      items: [{ database: "test_db", name: "test_table", kind: "table" }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetObjectDetails.mockResolvedValue(buildDetail());

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerenderWithTarget } = renderExplorer(1);

    const user = userEvent.setup();
    const dbButton = await screen.findByRole("button", { name: "test_db" });
    await user.click(dbButton);

    const tableButton = await screen.findByRole("button", { name: "test_table" });
    await user.click(tableButton);

    const inspectButton = await screen.findByRole("button", { name: "Inspect" });
    await user.click(inspectButton);

    expect(screen.getByText("test_table — Inspector")).toBeVisible();

    const triggerButton = screen.getByTestId("inspect-button");

    // Trigger: rerender with new targetId
    // State under test: inspectorKey, inspectorDetail, inspectTriggerElement
    rerenderWithTarget(2);

    // Inspector must close
    await waitFor(() => {
      expect(screen.queryByText("test_table — Inspector")).not.toBeInTheDocument();
    });

    // No console errors during the close
    expect(consoleSpy).not.toHaveBeenCalled();

    // Old trigger button is no longer connected (unmounted by tree re-render)
    expect(triggerButton.isConnected).toBe(false);

    // New target's database loads; old object metadata does not leak
    const newDbButton = await screen.findByRole("button", { name: "other_db" });
    expect(newDbButton).toBeVisible();
    expect(screen.queryByText("test_db")).not.toBeInTheDocument();
    expect(screen.queryByText("test_table")).not.toBeInTheDocument();
    expect(screen.queryByText("Inspect")).not.toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("object collapse while Inspector open: closes, re-expand shows new Inspect, full reopen cycle proves no stale trigger", async () => {
    const { user } = await openInspector();

    expect(screen.getByText("test_table — Inspector")).toBeVisible();

    // Trigger: collapse the object while Inspector is open
    // State under test: inspectorKey, inspectorDetail, inspectTriggerElement
    const tableSpan = screen.getByText("test_table");
    const tableButton = tableSpan.closest("button")!;
    await user.click(tableButton);

    // Inspector must close
    await waitFor(() => {
      expect(screen.queryByText("test_table — Inspector")).not.toBeInTheDocument();
    });

    // Re-expand the object
    await user.click(tableButton);

    // New Inspect button must appear (old trigger state was cleared)
    const newInspectButton = await screen.findByRole("button", { name: "Inspect" });
    expect(newInspectButton).toBeVisible();

    // Click new Inspect — must successfully reopen the Inspector
    await user.click(newInspectButton);
    expect(screen.getByText("test_table — Inspector")).toBeVisible();

    // Close via Escape — focus must return to the NEW Inspect button, not a stale reference
    await user.keyboard("{Escape}");
    expect(screen.queryByText("test_table — Inspector")).not.toBeInTheDocument();
    expect(newInspectButton).toHaveFocus();
  });

  // --- Table definition tests ---

  it("renders View definition button for table but makes no definition request until clicked", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    expect(viewDefButton).toBeVisible();
    expect(viewDefButton).toHaveTextContent("View definition");

    // No definition request should have been made on open
    expect(mockGetTableDefinition).not.toHaveBeenCalled();
  });

  it("clicking View definition fetches and renders the CREATE TABLE text", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(255)\n);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    expect(mockGetTableDefinition).toHaveBeenCalledTimes(1);
    expect(mockGetTableDefinition).toHaveBeenCalledWith(1, {
      database: "test_db",
      name: "test_table",
      signal: expect.any(AbortSignal),
    });

    // Definition text should be rendered in a pre element
    await waitFor(() => {
      expect(screen.getByText(/CREATE TABLE test_table/)).toBeVisible();
    });
    expect(screen.getByText(/id INT PRIMARY KEY AUTO_INCREMENT/)).toBeVisible();
  });

  it("view Inspector renders no definition action and sends no definition request", async () => {
    const viewDetail = buildDetail({
      kind: "view",
      name: "test_view",
    });
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_view",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE VIEW test_view AS SELECT 1;",
      truncated: false,
    });

    await openInspector(viewDetail);

    expect(screen.queryByTestId("view-definition-button")).not.toBeInTheDocument();
    expect(mockGetTableDefinition).not.toHaveBeenCalled();
  });

  it("loading state disables the button and shows loading text", async () => {
    // Create a deferred promise that we control
    let resolveDefinition!: (value: unknown) => void;
    const definitionPromise = new Promise((resolve) => {
      resolveDefinition = resolve;
    });
    mockGetTableDefinition.mockReturnValue(definitionPromise as ReturnType<typeof getTableDefinition>);

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    // Button should be disabled and show loading text
    expect(viewDefButton).toBeDisabled();
    expect(viewDefButton).toHaveTextContent("Loading definition…");

    // Resolve to clean up
    resolveDefinition({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });
  });

  it("truncated response renders the truncation warning", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: true,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    await waitFor(() => {
      expect(screen.getByText("Definition may be truncated.")).toBeVisible();
    });
  });

  it("prioritizes a controlled unsupported code over HTTP status and hides raw backend text", async () => {
    mockGetTableDefinition.mockRejectedValueOnce(
      new ApiError(
        500,
        "raw backend definition failure",
        undefined,
        "schema_definition_not_supported",
      ),
    );

    const { user } = await openInspector();
    await user.click(screen.getByTestId("view-definition-button"));

    await waitFor(() => {
      expect(screen.getByText("Table definition is not supported for this object.")).toBeVisible();
    });
    expect(screen.queryByText("raw backend definition failure")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("prioritizes a controlled timeout code over HTTP status and keeps an accessible retry", async () => {
    mockGetTableDefinition.mockRejectedValueOnce(
      new ApiError(403, "raw timeout failure", undefined, "schema_timeout"),
    );
    mockGetTableDefinition.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    const { user } = await openInspector();
    await user.click(screen.getByTestId("view-definition-button"));

    await waitFor(() => {
      expect(screen.getByText("Metadata request timed out.")).toBeVisible();
    });
    expect(screen.queryByText("raw timeout failure")).not.toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toHaveAccessibleName("Retry");
    await user.click(retryButton);
    await waitFor(() => expect(mockGetTableDefinition).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/CREATE TABLE test_table/)).toBeVisible();
  });

  it.each([
    ["schema_validation_failed", 500, "This table definition request is invalid.", false],
    ["schema_not_allowed", 500, "Target access is not allowed.", false],
    ["schema_object_not_found", 500, "This schema object is no longer available.", false],
    ["schema_target_not_found", 500, "This query target is no longer available.", false],
    ["schema_backend_error", 400, "The schema backend could not provide this definition.", true],
  ] as const)("maps %s before its conflicting HTTP status", async (code, status, message, retryable) => {
    const rawMessage = `raw ${code} backend detail`;
    mockGetTableDefinition.mockRejectedValueOnce(
      new ApiError(status, rawMessage, undefined, code),
    );

    const { user } = await openInspector();
    await user.click(screen.getByTestId("view-definition-button"));

    expect(await screen.findByText(message)).toBeVisible();
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" }) !== null).toBe(retryable);
  });

  it("localizes controlled object errors in zh-CN without exposing backend text", async () => {
    mockGetTableDefinition.mockRejectedValueOnce(
      new ApiError(500, "raw object detail", undefined, "schema_object_not_found"),
    );

    const { user } = await openInspector(buildDetail(), "zh-CN");
    await user.click(screen.getByTestId("view-definition-button"));

    expect(await screen.findByText("该 Schema 对象已不可用。")).toBeVisible();
    expect(screen.queryByText("raw object detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "重试" })).not.toBeInTheDocument();
  });

  it.each([
    ["unknown", "schema_unknown"],
    ["missing", undefined],
  ] as const)("falls back to the existing status mapping for a %s code", async (_kind, code) => {
    const rawMessage = "raw fallback backend detail";
    mockGetTableDefinition.mockRejectedValueOnce(
      new ApiError(404, rawMessage, undefined, code),
    );

    const { user } = await openInspector();
    await user.click(screen.getByTestId("view-definition-button"));

    expect(await screen.findByText("Table is no longer available.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toHaveAccessibleName("Retry");
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
  });

  it("controlled error shows localized message and Retry makes a second request", async () => {
    mockGetTableDefinition.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { status: 404 }));
    mockGetTableDefinition.mockResolvedValueOnce({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    // Should show localized error message (not raw error)
    await waitFor(() => {
      expect(screen.getByText("Table is no longer available.")).toBeVisible();
    });

    // Should NOT show any raw error markers
    expect(screen.queryByText(/Not Found/)).not.toBeInTheDocument();

    // Click Retry
    const retryButton = screen.getByRole("button", { name: "Retry" });
    await user.click(retryButton);

    // Should make a second request
    await waitFor(() => {
      expect(mockGetTableDefinition).toHaveBeenCalledTimes(2);
    });

    // Should show the definition after retry
    await waitFor(() => {
      expect(screen.getByText(/CREATE TABLE test_table/)).toBeVisible();
    });
  });

  it("close or rerender with different target does not render stale definition", async () => {
    // Create a deferred promise
    let resolveDefinition!: (value: unknown) => void;
    const definitionPromise = new Promise((resolve) => {
      resolveDefinition = resolve;
    });
    mockGetTableDefinition.mockReturnValue(definitionPromise as ReturnType<typeof getTableDefinition>);

    mockGetSchemaDatabases.mockResolvedValueOnce({
      targetResourceId: 1,
      defaultDatabase: "test_db",
      items: [{ name: "test_db", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    }).mockResolvedValueOnce({
      targetResourceId: 2,
      defaultDatabase: "other_db",
      items: [{ name: "other_db", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      items: [{ database: "test_db", name: "test_table", kind: "table" }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetObjectDetails.mockResolvedValue(buildDetail());

    const { rerenderWithTarget } = renderExplorer(1);
    const user = userEvent.setup();

    const dbButton = await screen.findByRole("button", { name: "test_db" });
    await user.click(dbButton);
    const tableButton = await screen.findByRole("button", { name: "test_table" });
    await user.click(tableButton);
    const inspectButton = await screen.findByRole("button", { name: "Inspect" });
    await user.click(inspectButton);

    // Start definition request
    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    // Switch target while request is pending
    rerenderWithTarget(2);

    // Now resolve the old request
    resolveDefinition({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    // Wait for the new target to load
    await screen.findByRole("button", { name: "other_db" });

    // The old definition must NOT appear under the new target
    expect(screen.queryByText(/CREATE TABLE test_table/)).not.toBeInTheDocument();
  });

  it("Escape and close-button focus restoration still works after definition request", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    const { user } = await openInspector();

    // Make a definition request
    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    // Wait for definition to load
    await waitFor(() => {
      expect(screen.getByText(/CREATE TABLE test_table/)).toBeVisible();
    });

    // Close via Escape
    await user.keyboard("{Escape}");

    // Inspector should close and focus should return to Inspect button
    expect(screen.queryByText("test_table — Inspector")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect" })).toHaveFocus();
  });
});

describe("Phase 38S: DDL is read-only highlighted CodeMirror", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("DDL definition renders in a CodeMirror editor instead of plain pre", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  name VARCHAR(255)\n);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    await waitFor(() => {
      const codeMirror = document.querySelector(".cm-editor");
      expect(codeMirror).toBeInTheDocument();
    });

    const definitionText = screen.queryByText(/CREATE TABLE test_table/);
    expect(definitionText).toBeInTheDocument();
    expect(definitionText!.closest("pre")).not.toBeInTheDocument();
  });

  it("DDL CodeMirror editor is read-only with no execution controls", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    await waitFor(() => {
      const codeMirror = document.querySelector(".cm-editor");
      expect(codeMirror).toBeInTheDocument();
      expect(codeMirror).toHaveAttribute("aria-readonly", "true");
    });

    expect(screen.queryByRole("button", { name: /^run$/i })).not.toBeInTheDocument();
  });

  it("DDL CodeMirror does not trigger an execute request on render", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (id INT);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    await waitFor(() => {
      expect(document.querySelector(".cm-editor")).toBeInTheDocument();
    });

    expect(mockGetTableDefinition).toHaveBeenCalledTimes(1);
  });

  it("DDL CodeMirror has SQL syntax highlighting applied", async () => {
    mockGetTableDefinition.mockResolvedValue({
      targetResourceId: 1,
      database: "test_db",
      name: "test_table",
      kind: "table",
      dialect: "mysql",
      definition: "CREATE TABLE test_table (\n  id INT PRIMARY KEY\n);",
      truncated: false,
    });

    const { user } = await openInspector();

    const viewDefButton = screen.getByTestId("view-definition-button");
    await user.click(viewDefButton);

    await waitFor(() => {
      const codeMirror = document.querySelector(".cm-editor");
      expect(codeMirror).toBeInTheDocument();
      const syntaxHighlight = codeMirror!.querySelector(".cm-keyword, .cm-typeName, .cm-property");
      expect(syntaxHighlight).toBeInTheDocument();
    });
  });
});
