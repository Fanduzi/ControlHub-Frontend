import { render, screen, within } from "@testing-library/react";
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

vi.mock("@/services/query-schema", () => ({
  getObjectDetails: vi.fn(),
  getSchemaDatabases: vi.fn(),
  getSchemaObjects: vi.fn(),
}));

import { QueryObjectExplorer } from "@/components/query/query-object-explorer";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import type { ObjectDetailResponse } from "@/types/query-schema";
import enMessages from "@/messages/en.json";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);

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

function renderExplorer(targetId = 1) {
  const onPreviewRequest = vi.fn();
  return {
    onPreviewRequest,
    ...render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryObjectExplorer
          targetId={targetId}
          store={new QuerySchemaStore()}
          onPreviewRequest={onPreviewRequest}
        />
      </NextIntlClientProvider>,
    ),
  };
}

async function openInspector(detail: ObjectDetailResponse = buildDetail()) {
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

  const inspectButton = await screen.findByRole("button", { name: "Inspect" });
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
});
