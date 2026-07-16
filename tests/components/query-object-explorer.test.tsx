import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/query-schema", () => ({
  getObjectDetails: vi.fn(),
  getSchemaDatabases: vi.fn(),
  getSchemaObjects: vi.fn(),
  getTableDefinition: vi.fn(),
}));

import { QueryObjectExplorer } from "@/components/query/query-object-explorer";
import { QuerySchemaBrowser } from "@/components/query/query-schema-browser";
import { QuerySchemaStore } from "@/lib/query-schema-store";
import { getObjectDetails, getSchemaDatabases, getSchemaObjects, getTableDefinition } from "@/services/query-schema";
import { buildQueryTarget } from "@/tests/fixtures/query-targets";
import type { ObjectSummary } from "@/types/query-schema";
import enMessages from "@/messages/en.json";

const mockGetSchemaDatabases = vi.mocked(getSchemaDatabases);
const mockGetSchemaObjects = vi.mocked(getSchemaObjects);
const mockGetObjectDetails = vi.mocked(getObjectDetails);
const mockGetTableDefinition = vi.mocked(getTableDefinition);

function renderBrowser() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QuerySchemaBrowser
        store={new QuerySchemaStore()}
        target={buildQueryTarget({
          resourceId: 12,
          capability: { queryKind: "sql", editorMode: "sql", languageLabel: "SQL" },
        })}
      />
    </NextIntlClientProvider>,
  );
}

describe("QuerySchemaBrowser", () => {
  beforeEach(() => {
    mockGetSchemaDatabases.mockReset();
    mockGetSchemaObjects.mockReset();
  });

  it("fetches only the first bounded database page when the explorer opens", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 12,
      defaultDatabase: "app",
      items: [{ name: "app", isDefault: true }],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    renderBrowser();

    const openButtons = screen.getAllByRole("button", { name: "Open objects" });
    await user.click(openButtons[0]!);

    await waitFor(() => {
      expect(mockGetSchemaDatabases).toHaveBeenCalledWith(
        12,
        expect.objectContaining({ page: 1, pageSize: 25 }),
      );
    });
    expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
  });

  it("keeps a 1000-object namespace lazy until its database is expanded", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 12,
      defaultDatabase: "app",
      items: Array.from({ length: 25 }, (_, index) => ({ name: `database_${index}`, isDefault: index === 0 })),
      pageInfo: { page: 1, pageSize: 25, totalItems: 1000, totalPages: 40, hasNextPage: true, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 12,
      database: "database_0",
      items: Array.from({ length: 500 }, (_, index) => ({ database: "database_0", name: `object_${index}`, kind: "table" as const })),
      pageInfo: { page: 1, pageSize: 25, totalItems: 1000, totalPages: 40, hasNextPage: true, hasPreviousPage: false },
    });

    renderBrowser();
    const openButtons = screen.getAllByRole("button", { name: "Open objects" });
    await user.click(openButtons[0]!);
    await screen.findByRole("button", { name: "database_0" });

    expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(1);
    expect(mockGetSchemaObjects).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "database_0" }));
    await waitFor(() => expect(mockGetSchemaObjects).toHaveBeenCalledTimes(1));
    expect(mockGetSchemaObjects).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ database: "database_0", page: 1, pageSize: 25 }),
    );
  });
});

// ---------------------------------------------------------------------------
// QueryObjectExplorer search and pagination — renders Explorer directly
// ---------------------------------------------------------------------------

function buildObjects(database: string, count: number, startIndex = 0): ObjectSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    database,
    name: `obj_${startIndex + i}`,
    kind: "table" as const,
  }));
}

function renderExplorer(targetId = 1) {
  const onPreviewRequest = vi.fn();
  const result = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QueryObjectExplorer
        targetId={targetId}
        store={new QuerySchemaStore()}
        onPreviewRequest={onPreviewRequest}
      />
    </NextIntlClientProvider>,
  );
  return { onPreviewRequest, ...result };
}

/** Helper: expand a database and wait for objects to load. */
async function expandDatabase(user: ReturnType<typeof userEvent.setup>, database: string) {
  const dbButton = screen.getByRole("button", { name: database });
  await user.click(dbButton);
  await waitFor(() => expect(mockGetSchemaObjects).toHaveBeenCalled());
}

describe("QueryObjectExplorer search and pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Database pagination ---

  it("shows Load more databases when hasNextPage is true", async () => {
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1,
      defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1", items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });

    // The Load more databases button should be visible
    const loadMore = screen.getByRole("button", { name: "Load more databases" });
    expect(loadMore).toBeVisible();
  });

  it("requests page 2 and appends databases in server order on Load more click", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: "db1",
        items: [{ name: "db1", isDefault: true }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 3, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: null,
        items: [{ name: "db2", isDefault: false }, { name: "db3", isDefault: false }],
        pageInfo: { page: 2, pageSize: 25, totalItems: 3, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });

    await user.click(screen.getByRole("button", { name: "Load more databases" }));

    await waitFor(() => {
      expect(mockGetSchemaDatabases).toHaveBeenCalledTimes(2);
      expect(mockGetSchemaDatabases).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ page: 2, pageSize: 25 }),
      );
    });

    // All databases should be visible in server order
    const dbButtons = screen.getAllByRole("button", { name: /^db\d$/ });
    expect(dbButtons).toHaveLength(3);
    expect(dbButtons[0]).toHaveTextContent("db1");
    expect(dbButtons[1]).toHaveTextContent("db2");
    expect(dbButtons[2]).toHaveTextContent("db3");
  });

  it("deduplicates databases by name when page 2 returns overlapping names", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: "db1",
        items: [{ name: "db1", isDefault: true }, { name: "db2", isDefault: false }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 3, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: null,
        items: [{ name: "db2", isDefault: false }, { name: "db3", isDefault: false }],
        pageInfo: { page: 2, pageSize: 25, totalItems: 3, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });

    await user.click(screen.getByRole("button", { name: "Load more databases" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "db3" })).toBeVisible());

    // db2 should appear only once
    const db2Buttons = screen.getAllByRole("button", { name: "db2" });
    expect(db2Buttons).toHaveLength(1);
  });

  // --- Object pagination ---

  it("shows Load more objects when object listing hasNextPage is true", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1",
      items: buildObjects("db1", 25),
      pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Load more objects should be visible for this database
    const loadMore = screen.getByRole("button", { name: "Load more objects" });
    expect(loadMore).toBeVisible();
  });

  it("requests object page 2 and appends in server order on Load more click", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: buildObjects("db1", 25, 0),
        pageInfo: { page: 1, pageSize: 25, totalItems: 30, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: buildObjects("db1", 5, 25),
        pageInfo: { page: 2, pageSize: 25, totalItems: 30, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    await user.click(screen.getByRole("button", { name: "Load more objects" }));

    await waitFor(() => {
      expect(mockGetSchemaObjects).toHaveBeenCalledTimes(2);
      expect(mockGetSchemaObjects).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ database: "db1", page: 2, pageSize: 25 }),
      );
    });

    // All 30 objects should be visible
    expect(screen.getByText("obj_0")).toBeVisible();
    expect(screen.getByText("obj_29")).toBeVisible();
  });

  it("deduplicates objects by (kind, name) when page 2 returns overlapping objects", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "shared_table", kind: "table" }, ...buildObjects("db1", 24, 1)],
        pageInfo: { page: 1, pageSize: 25, totalItems: 26, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "shared_table", kind: "table" }, { database: "db1", name: "obj_25", kind: "table" }],
        pageInfo: { page: 2, pageSize: 25, totalItems: 26, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    await user.click(screen.getByRole("button", { name: "Load more objects" }));
    await waitFor(() => expect(screen.getByText("obj_25")).toBeVisible());

    // shared_table should appear only once
    const sharedTables = screen.getAllByText("shared_table");
    expect(sharedTables).toHaveLength(1);
  });

  // --- Search behavior ---

  it("does not submit a request on every keystroke in the search input", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
      pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    const callsBefore = mockGetSchemaObjects.mock.calls.length;

    // Type into the search input
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "abc");

    // No additional requests should have been made
    expect(mockGetSchemaObjects.mock.calls.length).toBe(callsBefore);
  });

  it("submits search with server q parameter on Search button click", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "filtered_table", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "filtered");

    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(mockGetSchemaObjects).toHaveBeenCalledTimes(2);
      expect(mockGetSchemaObjects).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ database: "db1", q: "filtered", page: 1, pageSize: 25 }),
      );
    });

    // Filtered result should replace the previous listing
    expect(screen.getByText("filtered_table")).toBeVisible();
    expect(screen.queryByText("obj_0")).not.toBeInTheDocument();
  });

  it("submits search on Enter key press", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "searched_table", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "searched{Enter}");

    await waitFor(() => {
      expect(mockGetSchemaObjects).toHaveBeenCalledTimes(2);
      expect(mockGetSchemaObjects).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ database: "db1", q: "searched", page: 1 }),
      );
    });
  });

  it("trims whitespace-only search and submits without q", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
      pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    const callsBefore = mockGetSchemaObjects.mock.calls.length;
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "   ");
    await user.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(mockGetSchemaObjects.mock.calls.length).toBe(callsBefore + 1);
    });

    // The request should NOT include q for whitespace-only input
    const lastCall = mockGetSchemaObjects.mock.calls[mockGetSchemaObjects.mock.calls.length - 1];
    expect(lastCall?.[1]).not.toHaveProperty("q");
  });

  it("Clear resets search input and requests unfiltered page 1", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "filtered", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Search first
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "filtered");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("filtered")).toBeVisible());

    // Clear
    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() => {
      expect(mockGetSchemaObjects).toHaveBeenCalledTimes(3);
      expect(mockGetSchemaObjects).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ database: "db1", page: 1, pageSize: 25 }),
      );
    });

    // The last call should NOT include q
    const lastCall = mockGetSchemaObjects.mock.calls[2];
    expect(lastCall?.[1]).not.toHaveProperty("q");

    // Input should be cleared
    expect(searchInput).toHaveValue("");
  });

  // --- Per-database isolation ---

  it("per-database error does not affect other databases", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }, { name: "db2", isDefault: false }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db2", items: buildObjects("db2", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });

    // Expand db1 (will fail)
    await user.click(screen.getByRole("button", { name: "db1" }));
    await waitFor(() => expect(screen.getByText(/unable to load/i)).toBeVisible());

    // Expand db2 (should succeed)
    await user.click(screen.getByRole("button", { name: "db2" }));
    await waitFor(() => expect(screen.getByText("obj_0")).toBeVisible());

    // db1 error should still be visible
    expect(screen.getByText(/unable to load/i)).toBeVisible();
  });

  it("Retry re-requests the same page and query for the failed database", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 5),
        pageInfo: { page: 1, pageSize: 25, totalItems: 5, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await user.click(screen.getByRole("button", { name: "db1" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeVisible());

    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(mockGetSchemaObjects).toHaveBeenCalledTimes(2);
      expect(mockGetSchemaObjects).toHaveBeenLastCalledWith(
        1, expect.objectContaining({ database: "db1", page: 1, pageSize: 25 }),
      );
    });

    expect(screen.getByText("obj_0")).toBeVisible();
  });

  // --- Stale response rejection ---

  it("target change prevents late database page 2 response from writing", async () => {
    const user = userEvent.setup();
    let resolvePage2!: (value: unknown) => void;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });

    mockGetSchemaDatabases
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: "db1",
        items: [{ name: "db1", isDefault: true }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 2, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockReturnValueOnce(page2Promise as unknown as ReturnType<typeof getSchemaDatabases>);

    const { rerender } = renderExplorer(1);
    await screen.findByRole("button", { name: "db1" });

    // Click Load more but don't await
    const loadMore = screen.getByRole("button", { name: "Load more databases" });
    await user.click(loadMore);

    // Switch target before page 2 resolves
    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QueryObjectExplorer targetId={2} store={new QuerySchemaStore()} onPreviewRequest={vi.fn()} />
      </NextIntlClientProvider>,
    );

    // Now resolve page 2 for old target
    resolvePage2({
      targetResourceId: 1, defaultDatabase: null,
      items: [{ name: "db2", isDefault: false }],
      pageInfo: { page: 2, pageSize: 25, totalItems: 2, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
    });

    // db2 should NOT appear under the new target
    await waitFor(() => {
      expect(screen.queryByText("db2")).not.toBeInTheDocument();
    });
  });

  it("search replacement prevents late page 2 response from appending", async () => {
    const user = userEvent.setup();
    let resolvePage2!: (value: unknown) => void;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });

    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 25),
        pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockReturnValueOnce(page2Promise as ReturnType<typeof getSchemaObjects>)
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "searched", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Click Load more but don't await
    await user.click(screen.getByRole("button", { name: "Load more objects" }));

    // Submit a search before page 2 resolves
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "searched");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("searched")).toBeVisible());

    // Now resolve page 2 for the old unfiltered listing
    resolvePage2({
      targetResourceId: 1, database: "db1",
      items: buildObjects("db1", 5, 25),
      pageInfo: { page: 2, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
    });

    // Page 2 objects should NOT appear under the search results
    await waitFor(() => {
      expect(screen.queryByText("obj_25")).not.toBeInTheDocument();
    });
  });

  // --- No side-effect requests ---

  it("search and pagination do not request object details, definition, or related records", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 25),
        pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "searched", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Search
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "searched");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("searched")).toBeVisible());

    // No detail, definition, or related-record requests should have been made
    expect(mockGetObjectDetails).not.toHaveBeenCalled();
    expect(mockGetTableDefinition).not.toHaveBeenCalled();
  });

  // --- Later-page objects retain functionality ---

  it("objects from page 2 can still be expanded and show Inspect button", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 25),
        pageInfo: { page: 1, pageSize: 25, totalItems: 26, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "page2_table", kind: "table" }],
        pageInfo: { page: 2, pageSize: 25, totalItems: 26, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
      });
    mockGetObjectDetails.mockResolvedValue({
      targetResourceId: 1, database: "db1", name: "page2_table", kind: "table",
      columns: [{ name: "id", databaseType: "int", ordinalPosition: 1, nullable: false, primaryKey: true, autoIncrement: true }],
      indexes: [], foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Load page 2
    await user.click(screen.getByRole("button", { name: "Load more objects" }));
    await waitFor(() => expect(screen.getByText("page2_table")).toBeVisible());

    // Expand the page 2 object
    await user.click(screen.getByRole("button", { name: "page2_table" }));

    // Inspect button should be available
    await waitFor(() => expect(screen.getByRole("button", { name: "Inspect" })).toBeVisible());
  });

  // --- Search removes expanded object ---

  it("search that removes currently expanded object closes its detail and Inspector", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "visible_table", kind: "table" }, { database: "db1", name: "other_table", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 2, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      })
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1",
        items: [{ database: "db1", name: "other_table", kind: "table" }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
      });
    mockGetObjectDetails.mockResolvedValue({
      targetResourceId: 1, database: "db1", name: "visible_table", kind: "table",
      columns: [], indexes: [], foreignKeys: [],
      truncated: { columns: false, indexes: false, foreignKeys: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Expand visible_table and open Inspector
    await user.click(screen.getByRole("button", { name: "visible_table" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Inspect" })).toBeVisible());
    await user.click(screen.getByRole("button", { name: "Inspect" }));
    await waitFor(() => expect(screen.getByText("visible_table — Inspector")).toBeVisible());

    // Search that removes visible_table
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    await user.type(searchInput, "other");
    await user.click(screen.getByRole("button", { name: "Search" }));

    // visible_table should be gone, Inspector should close
    await waitFor(() => {
      expect(screen.queryByText("visible_table")).not.toBeInTheDocument();
      expect(screen.queryByText("visible_table — Inspector")).not.toBeInTheDocument();
    });

    // other_table should still be visible
    expect(screen.getByText("other_table")).toBeVisible();
  });

  // --- Accessibility ---

  it("search and pagination controls are outside treeitem roles", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1", items: buildObjects("db1", 25),
      pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    // Search input, Search button, Clear button, and Load more should NOT be inside a treeitem
    const searchInput = screen.getByRole("textbox", { name: /search objects in db1/i });
    const searchButton = screen.getByRole("button", { name: "Search" });
    const clearButton = screen.getByRole("button", { name: "Clear" });
    const loadMore = screen.getByRole("button", { name: "Load more objects" });

    // Verify none are inside a treeitem
    const treeitems = screen.getAllByRole("treeitem");
    for (const treeitem of treeitems) {
      expect(treeitem).not.toContainElement(searchInput);
      expect(treeitem).not.toContainElement(searchButton);
      expect(treeitem).not.toContainElement(clearButton);
      expect(treeitem).not.toContainElement(loadMore);
    }
  });

  it("search input has accessible name that identifies the database", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "my_database",
      items: [{ name: "my_database", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "my_database", items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "my_database" });
    await expandDatabase(user, "my_database");

    // The search input should have an accessible name containing the database name
    const searchInput = screen.getByRole("textbox", { name: /search objects in my_database/i });
    expect(searchInput).toBeVisible();
  });

  // --- Load more disabled while pending ---

  it("Load more objects is disabled while request is pending", async () => {
    const user = userEvent.setup();
    let resolvePage2!: (value: unknown) => void;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });

    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects
      .mockResolvedValueOnce({
        targetResourceId: 1, database: "db1", items: buildObjects("db1", 25),
        pageInfo: { page: 1, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockReturnValueOnce(page2Promise as ReturnType<typeof getSchemaObjects>);

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    const loadMore = screen.getByRole("button", { name: "Load more objects" });
    await user.click(loadMore);

    // Button should be disabled while pending
    expect(loadMore).toBeDisabled();

    // Resolve to clean up
    resolvePage2({
      targetResourceId: 1, database: "db1", items: [],
      pageInfo: { page: 2, pageSize: 25, totalItems: 50, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
    });
  });

  it("Load more databases is disabled while request is pending", async () => {
    const user = userEvent.setup();
    let resolvePage2!: (value: unknown) => void;
    const page2Promise = new Promise((resolve) => { resolvePage2 = resolve; });

    mockGetSchemaDatabases
      .mockResolvedValueOnce({
        targetResourceId: 1, defaultDatabase: "db1",
        items: [{ name: "db1", isDefault: true }],
        pageInfo: { page: 1, pageSize: 25, totalItems: 2, totalPages: 2, hasNextPage: true, hasPreviousPage: false },
      })
      .mockReturnValueOnce(page2Promise as ReturnType<typeof getSchemaDatabases>);

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });

    const loadMore = screen.getByRole("button", { name: "Load more databases" });
    await user.click(loadMore);

    // Button should be disabled while pending
    expect(loadMore).toBeDisabled();

    // Resolve to clean up
    resolvePage2({
      targetResourceId: 1, defaultDatabase: null,
      items: [{ name: "db2", isDefault: false }],
      pageInfo: { page: 2, pageSize: 25, totalItems: 2, totalPages: 2, hasNextPage: false, hasPreviousPage: true },
    });
  });

  // --- Empty and loading states ---

  it("shows per-database loading state when expanding a database", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });

    let resolveObjects!: (value: unknown) => void;
    const objectsPromise = new Promise((resolve) => { resolveObjects = resolve; });
    mockGetSchemaObjects.mockReturnValueOnce(objectsPromise as ReturnType<typeof getSchemaObjects>);

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await user.click(screen.getByRole("button", { name: "db1" }));

    // Loading indicator should be visible
    expect(screen.getByText(/loading/i)).toBeVisible();

    // Resolve to clean up
    resolveObjects({
      targetResourceId: 1, database: "db1", items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });
  });

  it("shows empty state when database has no objects", async () => {
    const user = userEvent.setup();
    mockGetSchemaDatabases.mockResolvedValue({
      targetResourceId: 1, defaultDatabase: "db1",
      items: [{ name: "db1", isDefault: true }],
      pageInfo: { page: 1, pageSize: 25, totalItems: 1, totalPages: 1, hasNextPage: false, hasPreviousPage: false },
    });
    mockGetSchemaObjects.mockResolvedValue({
      targetResourceId: 1, database: "db1", items: [],
      pageInfo: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false },
    });

    renderExplorer();
    await screen.findByRole("button", { name: "db1" });
    await expandDatabase(user, "db1");

    expect(screen.getByText(/no objects found/i)).toBeVisible();
  });
});
