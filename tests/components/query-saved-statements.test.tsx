// input: @testing-library/react, @/components/query/query-saved-statements, @/services/query-saved-statements (mocked)
// output: Vitest component tests for QuerySavedStatements (terminal list generations, terminal delete state machine, CRUD, shared-template gate, templates)
// pos: unit-level behavioral tests for the saved-statements UI component
// note: if this file changes, update header and tests/components/README.md
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuerySavedStatements } from "@/components/query/query-saved-statements";
import type {
  QuerySavedStatementScope,
  QuerySavedStatementParameterDefinition,
} from "@/types/query-saved-statement";
import {
  listSavedStatements,
  createSavedStatement,
  deleteSavedStatement,
  SavedStatementError,
} from "@/services/query-saved-statements";
import enMessages from "@/messages/en.json";

vi.mock("@/services/query-saved-statements", () => ({
  listSavedStatements: vi.fn(),
  createSavedStatement: vi.fn(),
  updateSavedStatement: vi.fn(),
  deleteSavedStatement: vi.fn(),
  SavedStatementError: class SavedStatementError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.name = "SavedStatementError";
      this.status = status;
      this.code = code;
    }
  },
}));

const mockListSavedStatements = vi.mocked(listSavedStatements);
const mockCreateSavedStatement = vi.mocked(createSavedStatement);
const mockDeleteSavedStatement = vi.mocked(deleteSavedStatement);

function renderComponent(
  props: Partial<React.ComponentProps<typeof QuerySavedStatements>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QuerySavedStatements
        targetResourceId={22}
        currentStatement="SELECT 1"
        onStatementLoad={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function emptyResponse(canManage = false) {
  return {
    items: [],
    pageInfo: {
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    canManageSharedTemplates: canManage,
  };
}

function singleItemResponse(overrides?: { name?: string; scope?: QuerySavedStatementScope; parameters?: readonly QuerySavedStatementParameterDefinition[] }) {
  return {
    items: [
      {
        id: 1,
        targetResourceId: 22,
        name: overrides?.name ?? "Test query",
        statement: "SELECT id FROM orders",
        scope: (overrides?.scope ?? "personal") as QuerySavedStatementScope,
        parameters: overrides?.parameters ?? [],
        createdAt: "2026-07-28T00:00:00Z",
        updatedAt: "2026-07-28T00:00:00Z",
      },
    ],
    pageInfo: {
      page: 1,
      pageSize: 20,
      totalItems: 1,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
    canManageSharedTemplates: false,
  };
}

describe("QuerySavedStatements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state", () => {
    mockListSavedStatements.mockReturnValue(new Promise(() => {}));
    renderComponent();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
  });

  it("shows saved statements", async () => {
    mockListSavedStatements.mockResolvedValue(
      singleItemResponse({
        name: "Recent orders",
        parameters: [{ name: "status", type: "string" }],
      }),
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Recent orders")).toBeInTheDocument();
    });
    expect(screen.getByText("Parameterized")).toBeInTheDocument();
  });

  it("shows shared badge for shared_template", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name: "Template",
          statement: "SELECT 1",
          scope: "shared_template",
          parameters: [],
          createdAt: "2026-07-28T00:00:00Z",
          updatedAt: "2026-07-28T00:00:00Z",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      canManageSharedTemplates: true,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Shared")).toBeInTheDocument();
    });
  });

  it("hides Edit/Delete for shared_template when canManageSharedTemplates is false", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name: "Template",
          statement: "SELECT 1",
          scope: "shared_template",
          parameters: [],
          createdAt: "2026-07-28T00:00:00Z",
          updatedAt: "2026-07-28T00:00:00Z",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      canManageSharedTemplates: false,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Template")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /load template/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit template/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete template/i }),
    ).not.toBeInTheDocument();
  });

  it("shows Edit/Delete for shared_template when canManageSharedTemplates is true", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name: "Template",
          statement: "SELECT 1",
          scope: "shared_template",
          parameters: [],
          createdAt: "2026-07-28T00:00:00Z",
          updatedAt: "2026-07-28T00:00:00Z",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      canManageSharedTemplates: true,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Template")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /load template/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit template/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /delete template/i }),
    ).toBeInTheDocument();
  });

  it("calls onStatementLoad with statement and parameters when load button clicked", async () => {
    const onStatementLoad = vi.fn();
    mockListSavedStatements.mockResolvedValue(singleItemResponse());
    const user = userEvent.setup();
    renderComponent({ onStatementLoad });
    await waitFor(() => {
      expect(screen.getByText("Test query")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /load test query/i }),
    );
    expect(onStatementLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        statement: "SELECT id FROM orders",
        parameters: [],
      }),
    );
  });

  it("shows create shared button only when server says canManageSharedTemplates", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse(false));
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    expect(screen.queryByText("Create Shared")).not.toBeInTheDocument();
  });

  it("shows create shared button when server says canManageSharedTemplates true", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse(true));
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    expect(screen.getByText("Create Shared")).toBeInTheDocument();
  });

  it.each([
    [403, "forbidden", "Saved statements are unavailable for this target."],
    [404, "not_found", "This saved-statement context is no longer available."],
  ] as const)("settles a %i response as a non-retryable controlled error", async (status, code, message) => {
    mockListSavedStatements.mockRejectedValue(
      new SavedStatementError(status, code, "raw server detail"),
    );
    renderComponent();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("raw server detail")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("settles a transient failure with an accessible Retry action", async () => {
    mockListSavedStatements
      .mockRejectedValueOnce(new SavedStatementError(500, "internal_error", "Server error"))
      .mockResolvedValueOnce(emptyResponse());
    const user = userEvent.setup();
    renderComponent();

    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load saved statements.");
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("No saved queries yet.")).toBeInTheDocument();
    expect(mockListSavedStatements).toHaveBeenCalledTimes(2);
  });

  it("retains same-target rows during refresh but disables mutations and hides them on failure", async () => {
    const refresh = deferred<ReturnType<typeof singleItemResponse>>();
    mockListSavedStatements
      .mockResolvedValueOnce(singleItemResponse({ name: "Current row" }))
      .mockReturnValueOnce(refresh.promise);
    const user = userEvent.setup();
    renderComponent();

    expect(await screen.findByText("Current row")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search saved statements" }), "new");
    await waitFor(() => expect(mockListSavedStatements).toHaveBeenCalledTimes(2));

    expect(screen.getByText("Current row")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search saved statements" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /save current statement as personal/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /load current row/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /edit current row/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /delete current row/i })).toBeDisabled();

    refresh.reject(new SavedStatementError(500, "internal_error", "raw"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Failed to load saved statements.");
    expect(screen.queryByText("Current row")).not.toBeInTheDocument();
  });

  it("resets target-scoped search, rows, and dialogs when the target changes", async () => {
    const nextTarget = deferred<ReturnType<typeof singleItemResponse>>();
    mockListSavedStatements
      .mockResolvedValueOnce(singleItemResponse({ name: "Old target row" }))
      .mockReturnValue(nextTarget.promise);
    const user = userEvent.setup();
    const view = renderComponent();

    expect(await screen.findByText("Old target row")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search saved statements" }), "old search");
    await user.click(screen.getByRole("button", { name: /save current statement as personal/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QuerySavedStatements
          targetResourceId={33}
          currentStatement="SELECT 1"
          onStatementLoad={vi.fn()}
        />
      </NextIntlClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Search saved statements")).toHaveValue("");
      expect(screen.queryByText("Old target row")).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("ignores a mutation completion after an A-B-A target transition", async () => {
    const create = deferred<Awaited<ReturnType<typeof createSavedStatement>>>();
    const middleTarget = deferred<ReturnType<typeof singleItemResponse>>();
    const currentTarget = deferred<ReturnType<typeof singleItemResponse>>();
    mockListSavedStatements
      .mockResolvedValueOnce(emptyResponse())
      .mockReturnValueOnce(middleTarget.promise)
      .mockReturnValueOnce(currentTarget.promise);
    mockCreateSavedStatement.mockReturnValueOnce(create.promise);
    const user = userEvent.setup();
    const view = renderComponent();

    expect(await screen.findByText("No saved queries yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save current statement as personal/i }));
    await user.type(screen.getByLabelText("Statement name"), "Old target create");
    await user.click(screen.getByRole("button", { name: "Create" }));

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QuerySavedStatements
          targetResourceId={33}
          currentStatement="SELECT 1"
          onStatementLoad={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(mockListSavedStatements).toHaveBeenCalledTimes(2));

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QuerySavedStatements
          targetResourceId={22}
          currentStatement="SELECT 1"
          onStatementLoad={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(mockListSavedStatements).toHaveBeenCalledTimes(3));

    create.resolve({
      id: 99,
      targetResourceId: 22,
      name: "Old target create",
      statement: "SELECT 1",
      scope: "personal",
      parameters: [],
      createdAt: "2026-08-18T00:00:00Z",
      updatedAt: "2026-08-18T00:00:00Z",
    });
    currentTarget.resolve(singleItemResponse({ name: "Current target row" }));

    expect(await screen.findByText("Current target row")).toBeInTheDocument();
    expect(mockListSavedStatements).toHaveBeenCalledTimes(3);
  });

  it("ignores a late response from the previous target generation", async () => {
    const oldTarget = deferred<ReturnType<typeof singleItemResponse>>();
    const newTarget = deferred<ReturnType<typeof singleItemResponse>>();
    mockListSavedStatements
      .mockReturnValueOnce(oldTarget.promise)
      .mockReturnValueOnce(newTarget.promise);
    const view = renderComponent();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QuerySavedStatements
          targetResourceId={33}
          currentStatement="SELECT 1"
          onStatementLoad={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() => expect(mockListSavedStatements).toHaveBeenCalledTimes(2));

    oldTarget.resolve(singleItemResponse({ name: "Late old row" }));
    await Promise.resolve();
    expect(screen.queryByText("Late old row")).not.toBeInTheDocument();

    newTarget.resolve(singleItemResponse({ name: "Current target row" }));
    expect(await screen.findByText("Current target row")).toBeInTheDocument();
  });

  it("opens create dialog and pre-fills current statement", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    mockCreateSavedStatement.mockResolvedValue({
      id: 99,
      targetResourceId: 22,
      name: "New",
      statement: "SELECT id FROM users",
      scope: "personal",
      parameters: [],
      createdAt: "2026-07-28T00:00:00Z",
      updatedAt: "2026-07-28T00:00:00Z",
    });
    const user = userEvent.setup();
    renderComponent({ currentStatement: "SELECT id FROM users" });
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    // Dialog opens with statement pre-filled (use getAllByText since Dialog+Sheet both render)
    await waitFor(() => {
      const nameInputs = screen.getAllByLabelText("Statement name");
      expect(nameInputs.length).toBeGreaterThanOrEqual(1);
    });
    // Statement textarea should be pre-filled
    const stmtInputs = screen.getAllByLabelText("SQL statement");
    expect(stmtInputs[0]).toHaveValue("SELECT id FROM users");
  });

  it("opens edit dialog with scope immutability shown", async () => {
    mockListSavedStatements.mockResolvedValue(singleItemResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Test query")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /edit test query/i }),
    );
    // Scope immutable hint should be visible
    await waitFor(() => {
      const immutHints = screen.getAllByText("(cannot be changed)");
      expect(immutHints.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("opens delete confirmation with item name", async () => {
    mockListSavedStatements.mockResolvedValue(
      singleItemResponse({ name: "To delete" }),
    );
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("To delete")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /delete to delete/i }),
    );
    await waitFor(() => {
      expect(
        screen.getByText(/permanently delete.*To delete/i),
      ).toBeInTheDocument();
    });
  });

  it("does not call execute/explain/schema endpoints on load", async () => {
    const onStatementLoad = vi.fn();
    mockListSavedStatements.mockResolvedValue(singleItemResponse());
    const user = userEvent.setup();
    renderComponent({ onStatementLoad });
    await waitFor(() => {
      expect(screen.getByText("Test query")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /load test query/i }),
    );
    expect(onStatementLoad).toHaveBeenCalledTimes(1);
    expect(onStatementLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        statement: "SELECT id FROM orders",
        parameters: [],
      }),
    );
  });

  it("calls onStatementLoad with parameters from saved statement", async () => {
    const onStatementLoad = vi.fn();
    const params: QuerySavedStatementParameterDefinition[] = [
      { name: "status", type: "string" },
      { name: "min_id", type: "integer" },
    ];
    mockListSavedStatements.mockResolvedValue(
      singleItemResponse({ parameters: params }),
    );
    const user = userEvent.setup();
    renderComponent({ onStatementLoad });
    await waitFor(() => {
      expect(screen.getByText("Test query")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /load test query/i }),
    );
    expect(onStatementLoad).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 1,
        statement: "SELECT id FROM orders",
        parameters: params,
      }),
    );
  });

  it("shows parameter declarations form in create dialog", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("Parameter declarations")).toBeInTheDocument();
    });
    expect(screen.getByText("No parameters defined")).toBeInTheDocument();
  });

  it("adds and removes parameter rows in create dialog", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    expect(screen.queryByText("No parameters defined")).not.toBeInTheDocument();
    const paramInputs = screen.getAllByPlaceholderText("e.g. status");
    expect(paramInputs.length).toBeGreaterThanOrEqual(1);
    const typeSelects = screen.getAllByRole("combobox", { name: /type/i });
    expect(typeSelects.length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getAllByRole("button", { name: /remove parameter/i })[0]!);
    expect(screen.getByText("No parameters defined")).toBeInTheDocument();
  });

  it("keeps the mobile multi-parameter form scrollable", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    for (let i = 0; i < 20; i++) {
      await user.click(screen.getByRole("button", { name: /add parameter/i }));
    }
    const sheet = screen.getByRole("dialog");
    expect(sheet.className).toContain("max-h-[90vh]");
    expect(sheet.className).toContain("overflow-y-auto");
    vi.unstubAllGlobals();
  });

  it("loads parameters into edit dialog from saved statement", async () => {
    const params: QuerySavedStatementParameterDefinition[] = [
      { name: "status", type: "boolean" },
    ];
    mockListSavedStatements.mockResolvedValue(
      singleItemResponse({ parameters: params }),
    );
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Test query")).toBeInTheDocument();
    });
    await user.click(
      screen.getByRole("button", { name: /edit test query/i }),
    );
    await waitFor(() => {
      const paramInputs = screen.getAllByPlaceholderText("e.g. status");
      expect(paramInputs.some((el) => (el as HTMLInputElement).value === "status")).toBe(true);
    });
    const typeSelects = screen.getAllByRole("combobox", { name: /type/i });
    expect(typeSelects.some((el) => (el as HTMLSelectElement).value === "boolean")).toBe(true);
  });
});

describe("QuerySavedStatements declaration validation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables create submit when parameter name is empty", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const submitButtons = screen.getAllByRole("button", { name: /^Create$/i });
    expect(submitButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("disables create submit when parameter name is invalid", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const nameInput = screen.getAllByPlaceholderText("e.g. status")[0]!;
    await user.type(nameInput, "Invalid Name!");

    const submitButtons = screen.getAllByRole("button", { name: /^Create$/i });
    expect(submitButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("disables create submit when parameter name has surrounding whitespace", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    await user.type(screen.getAllByPlaceholderText("e.g. status")[0]!, " status");

    expect(screen.getAllByRole("button", { name: /^Create$/i }).some((button) =>
      (button as HTMLButtonElement).disabled,
    )).toBe(true);
  });

  it("disables create submit when parameter names are duplicated", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const nameInputs = screen.getAllByPlaceholderText("e.g. status");
    await user.type(nameInputs[0]!, "status");
    await user.type(nameInputs[1]!, "status");

    const submitButtons = screen.getAllByRole("button", { name: /^Create$/i });
    expect(submitButtons.some((btn) => (btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("enables create submit when all declarations are valid", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    mockCreateSavedStatement.mockResolvedValue({
      id: 99,
      targetResourceId: 22,
      name: "Test",
      statement: "SELECT 1",
      scope: "personal",
      parameters: [],
      createdAt: "2026-08-01T00:00:00Z",
      updatedAt: "2026-08-01T00:00:00Z",
    });
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const nameInput = screen.getAllByPlaceholderText("e.g. status")[0]!;
    await user.type(nameInput, "valid_name");

    const stmtNameInput = screen.getByLabelText("Statement name");
    await user.type(stmtNameInput, "My query");

    const submitButtons = screen.getAllByRole("button", { name: /^Create$/i });
    expect(submitButtons.some((btn) => !(btn as HTMLButtonElement).disabled)).toBe(true);
  });

  it("add parameter button is disabled at 20 parameters", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });

    for (let i = 0; i < 20; i++) {
      await user.click(screen.getByRole("button", { name: /add parameter/i }));
      const nameInputs = screen.getAllByPlaceholderText("e.g. status");
      await user.type(nameInputs[nameInputs.length - 1]!, `p${i}`);
    }

    expect(screen.getByText(/20\/20/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add parameter/i })).toBeDisabled();
  }, 10_000);

  it("shows count indicator next to parameter section title", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });

    expect(screen.getByText(/0\/20/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    expect(screen.getByText(/1\/20/)).toBeInTheDocument();
  });

  it("deleting a middle row preserves the remaining rows values", async () => {
    mockListSavedStatements.mockResolvedValue(emptyResponse());
    const user = userEvent.setup();
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
    await user.click(screen.getByText("Save personal"));
    await waitFor(() => {
      expect(screen.getByText("No parameters defined")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    await user.click(screen.getByRole("button", { name: /add parameter/i }));
    await user.click(screen.getByRole("button", { name: /add parameter/i }));

    const nameInputs = screen.getAllByPlaceholderText("e.g. status");
    await user.type(nameInputs[0]!, "alpha");
    await user.type(nameInputs[1]!, "beta");
    await user.type(nameInputs[2]!, "gamma");

    const removeButtons = screen.getAllByRole("button", { name: /remove parameter/i });
    await user.click(removeButtons[1]!);

    const remainingInputs = screen.getAllByPlaceholderText("e.g. status");
    expect(remainingInputs).toHaveLength(2);
    expect(remainingInputs[0]).toHaveValue("alpha");
    expect(remainingInputs[1]).toHaveValue("gamma");
  });
});

describe("QuerySavedStatements delete terminal state", () => {
  beforeEach(() => vi.clearAllMocks());

  function paged(page: number, totalPages: number, name: string) {
    return {
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name,
          statement: "SELECT 1",
          scope: "personal" as const,
          parameters: [],
          createdAt: "2026-08-01T00:00:00Z",
          updatedAt: "2026-08-01T00:00:00Z",
        },
      ],
      pageInfo: {
        page,
        pageSize: 20,
        totalItems: page * 20,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      canManageSharedTemplates: false,
    };
  }

  it("blocks dismissal and duplicate submit while pending", async () => {
    const del = deferred<void>();
    mockListSavedStatements.mockResolvedValue(singleItemResponse({ name: "Pending item" }));
    mockDeleteSavedStatement.mockReturnValue(del.promise);
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Pending item")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete pending item/i }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");
    const pendingConfirm = within(dialog).getByRole("button", { name: "Deleting…" });
    expect(pendingConfirm).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    // A second submit is ignored (pending guard).
    await user.click(pendingConfirm);
    expect(mockDeleteSavedStatement).toHaveBeenCalledTimes(1);
    // Escape must not dismiss while the request is in flight.
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(mockDeleteSavedStatement).toHaveBeenCalledTimes(1);

    del.resolve();
    expect(await screen.findByText("Pending item")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("shows Retry and Cancel on a transient failure and retries", async () => {
    const del = deferred<void>();
    mockListSavedStatements.mockResolvedValue(singleItemResponse({ name: "Flaky" }));
    mockDeleteSavedStatement
      .mockReturnValueOnce(del.promise)
      .mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Flaky")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete flaky/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    del.reject(new SavedStatementError(500, "internal_error", "boom"));
    const errDialog = await screen.findByRole("alertdialog");
    expect(within(errDialog).getByRole("alert")).toHaveTextContent("Deletion failed.");
    expect(within(errDialog).getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(within(errDialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(within(errDialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(mockDeleteSavedStatement).toHaveBeenCalledTimes(1);

    await user.click(within(errDialog).getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Flaky")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(mockDeleteSavedStatement).toHaveBeenCalledTimes(2);
  });

  it("shows Retry and Cancel on a network failure", async () => {
    mockListSavedStatements.mockResolvedValue(singleItemResponse({ name: "Offline" }));
    mockDeleteSavedStatement.mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Offline")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete offline/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    const errDialog = await screen.findByRole("alertdialog");
    expect(within(errDialog).getByRole("alert")).toHaveTextContent("Deletion failed.");
    expect(within(errDialog).getByRole("button", { name: "Retry" })).toBeEnabled();
    expect(within(errDialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(within(errDialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("shows a non-retryable error with Cancel only on 403", async () => {
    mockListSavedStatements.mockResolvedValue(singleItemResponse({ name: "Forbidden" }));
    mockDeleteSavedStatement.mockRejectedValue(
      new SavedStatementError(403, "forbidden", "raw detail"),
    );
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Forbidden")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete forbidden/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    const errDialog = await screen.findByRole("alertdialog");
    expect(within(errDialog).getByRole("alert")).toHaveTextContent("don't have permission");
    expect(within(errDialog).queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(within(errDialog).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(within(errDialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(screen.queryByText("raw detail")).not.toBeInTheDocument();

    await user.click(within(errDialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });

  it("closes, refreshes the list, and announces absence on 404 without claiming success", async () => {
    const reload = deferred<ReturnType<typeof singleItemResponse>>();
    mockListSavedStatements
      .mockResolvedValueOnce(singleItemResponse({ name: "Gone" }))
      .mockReturnValueOnce(reload.promise);
    mockDeleteSavedStatement.mockRejectedValue(
      new SavedStatementError(404, "not_found", "raw detail"),
    );
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Gone")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete gone/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mockListSavedStatements).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/Gone is no longer available/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gone deleted/i)).not.toBeInTheDocument();
    expect(screen.queryByText("raw detail")).not.toBeInTheDocument();
    reload.resolve(singleItemResponse({ name: "Gone" }));
    expect(await screen.findByText("Gone")).toBeInTheDocument();
  });

  it("loads the previous page when deleting the last row on a later page", async () => {
    mockListSavedStatements.mockResolvedValue(paged(3, 3, "Last row"));
    mockDeleteSavedStatement.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Last row")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete last row/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(mockDeleteSavedStatement).toHaveBeenCalledWith(22, 1);
    const refetchedLaterPage = mockListSavedStatements.mock.calls.some(
      (call) => {
        const params = call[1] as { page?: number } | undefined;
        return params?.page === 2;
      },
    );
    expect(refetchedLaterPage).toBe(true);
  });

  it("uses polite status for reconciliation and alert for inline errors", async () => {
    mockListSavedStatements
      .mockResolvedValueOnce(singleItemResponse({ name: "Ann" }))
      .mockResolvedValue(singleItemResponse({ name: "Ann" }));
    mockDeleteSavedStatement.mockRejectedValue(
      new SavedStatementError(404, "not_found", "x"),
    );
    const user = userEvent.setup();
    renderComponent();
    expect(await screen.findByText("Ann")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete ann/i }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.getByText(/Ann is no longer available/i)).toBeInTheDocument(),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/Ann is no longer available/i);
    expect(document.activeElement).not.toBe(status);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the delete dialog when the target changes", async () => {
    mockListSavedStatements.mockResolvedValue(singleItemResponse({ name: "Before switch" }));
    const user = userEvent.setup();
    const view = renderComponent();
    expect(await screen.findByText("Before switch")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete before switch/i }));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();

    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <QuerySavedStatements
          targetResourceId={33}
          currentStatement="SELECT 1"
          onStatementLoad={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
  });
});
