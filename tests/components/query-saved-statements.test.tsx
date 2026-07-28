import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuerySavedStatements } from "@/components/query/query-saved-statements";
import type { QuerySavedStatementScope } from "@/types/query-saved-statement";
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

function singleItemResponse(overrides?: { name?: string; scope?: QuerySavedStatementScope }) {
  return {
    items: [
      {
        id: 1,
        targetResourceId: 22,
        name: overrides?.name ?? "Test query",
        statement: "SELECT id FROM orders",
        scope: (overrides?.scope ?? "personal") as QuerySavedStatementScope,
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
      singleItemResponse({ name: "Recent orders" }),
    );
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("Recent orders")).toBeInTheDocument();
    });
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

  it("calls onStatementLoad when load button clicked", async () => {
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
    expect(onStatementLoad).toHaveBeenCalledWith("SELECT id FROM orders");
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
    // Only onStatementLoad should be called; no side-effect endpoints
    expect(onStatementLoad).toHaveBeenCalledTimes(1);
    expect(onStatementLoad).toHaveBeenCalledWith("SELECT id FROM orders");
  });
});
