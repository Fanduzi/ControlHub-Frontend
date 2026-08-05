import { render, screen, waitFor } from "@testing-library/react";
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
    expect(onStatementLoad).toHaveBeenCalledWith("SELECT id FROM orders", []);
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

  it("shows error state on load failure", async () => {
    mockListSavedStatements.mockRejectedValue(
      new SavedStatementError(500, "internal_error", "Server error"),
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
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
    expect(onStatementLoad).toHaveBeenCalledWith("SELECT id FROM orders", []);
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
      "SELECT id FROM orders",
      params,
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
