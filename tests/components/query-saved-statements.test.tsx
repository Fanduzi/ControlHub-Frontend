import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuerySavedStatements } from "@/components/query/query-saved-statements";
import {
  listSavedStatements,
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

function renderComponent(
  props: Partial<React.ComponentProps<typeof QuerySavedStatements>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <QuerySavedStatements
        targetResourceId={22}
        canManageSharedTemplates={false}
        currentStatement="SELECT 1"
        onStatementLoad={vi.fn()}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe("QuerySavedStatements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading state", () => {
    mockListSavedStatements.mockReturnValue(new Promise(() => {})); // never resolves
    renderComponent();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      canManageSharedTemplates: false,
    });
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No saved queries yet.")).toBeInTheDocument();
    });
  });

  it("shows saved statements", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name: "Recent orders",
          statement: "SELECT id FROM orders",
          scope: "personal",
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
    renderComponent({ canManageSharedTemplates: true });
    await waitFor(() => {
      expect(screen.getByText("Shared")).toBeInTheDocument();
    });
  });

  it("calls onStatementLoad when load button clicked", async () => {
    const onStatementLoad = vi.fn();
    mockListSavedStatements.mockResolvedValue({
      items: [
        {
          id: 1,
          targetResourceId: 22,
          name: "Test",
          statement: "SELECT id FROM orders",
          scope: "personal",
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
    const user = userEvent.setup();
    renderComponent({ onStatementLoad });
    await waitFor(() => {
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /load/i }));
    expect(onStatementLoad).toHaveBeenCalledWith("SELECT id FROM orders");
  });

  it("shows create shared button only when canManageSharedTemplates", async () => {
    mockListSavedStatements.mockResolvedValue({
      items: [],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      canManageSharedTemplates: false,
    });
    renderComponent({ canManageSharedTemplates: false });
    await waitFor(() => {
      expect(screen.queryByText("Create Shared")).not.toBeInTheDocument();
    });
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
});
