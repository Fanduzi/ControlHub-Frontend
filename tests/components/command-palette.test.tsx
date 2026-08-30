// input: vitest, testing-library, command palette, auth-role, resource service and environment-provider mocks
// output: command palette tests — server-authoritative all-type resource search with keyboard routing, localized context, and stale/error recovery, create-resource admin gating, and empty-query operator navigation
// pos: component tests for the console command palette affordance gating
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/app-shell/command-palette";
import messages from "@/messages/en.json";

let isAdmin = true;
const { listResourcesMock, listEnvironmentsMock, routerPushMock } = vi.hoisted(() => ({
  listResourcesMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

vi.mock("@/services/resources", () => ({
  listResources: listResourcesMock,
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: listEnvironmentsMock,
}));

vi.mock("@/components/providers/environment-provider", () => ({
  useEnvironment: () => ({
    environments: [
      { id: 7, name: "Production", slug: "production", description: "", createdAt: "2026-01-01T00:00:00Z" },
    ],
  }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ setTheme: vi.fn(), theme: "light" }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

function renderPalette() {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CommandPalette open onOpenChange={() => undefined} />
    </NextIntlClientProvider>,
  );
}

describe("CommandPalette", () => {
  beforeEach(() => {
    isAdmin = true;
    listResourcesMock.mockReset();
    listEnvironmentsMock.mockReset();
    listEnvironmentsMock.mockResolvedValue([
      { id: 7, name: "Production", slug: "production", description: "", createdAt: "2026-01-01T00:00:00Z" },
    ]);
    routerPushMock.mockReset();
  });

  it("shows the create-resource command for administrators", () => {
    renderPalette();

    expect(screen.getByText("New resource")).toBeInTheDocument();
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("hides the create-resource command for non-admin operators (server stays authoritative)", () => {
    isAdmin = false;

    renderPalette();

    expect(screen.queryByText("New resource")).toBeNull();
    // Read navigation stays available to every operator.
    expect(screen.getByText("Overview")).toBeInTheDocument();
  });

  it("shows and keyboard-navigates a server match whose display name excludes the query", async () => {
    listResourcesMock.mockResolvedValue({
      items: [{
        id: 79,
        displayName: "Orders database",
        resourceType: "database_instance",
        environmentId: 7,
        healthStatus: "warning",
      }],
      pageInfo: { page: 1, pageSize: 10, totalItems: 1, totalPages: 1 },
    });
    const user = userEvent.setup();

    renderPalette();
    await user.type(screen.getByPlaceholderText("Search resources, owners, IDs"), "10.0.0.7");

    await waitFor(() => {
      // WHY: the palette is a cross-inventory finder, so every CI type is
      // searched server-side without a type filter and has a bounded payload.
      expect(listResourcesMock).toHaveBeenCalledWith({ q: "10.0.0.7", pageSize: 10 });
    });
    expect(listEnvironmentsMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("option", { name: /Orders database/i })).toBeVisible();
    expect(screen.queryByText("No results found.")).toBeNull();
    expect(await screen.findByText("DB Instance")).toBeInTheDocument();
    expect(screen.getByText("Production")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
    expect(screen.queryByText("Overview")).toBeNull();
    await user.keyboard("{Enter}");

    expect(routerPushMock).toHaveBeenCalledWith("/resources/79");
  });

  it("keeps empty-query commands out of search results and recovers from stale or failed searches", async () => {
    let resolveFirst: (value: { items: []; pageInfo: { page: number; pageSize: number; totalItems: number; totalPages: number } }) => void;
    listResourcesMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockRejectedValueOnce(new Error("network"));
    const user = userEvent.setup();

    renderPalette();
    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByText("Light")).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText("Search resources, owners, IDs"), "old");
    await waitFor(() => expect(listResourcesMock).toHaveBeenCalledTimes(1));
    await user.clear(screen.getByPlaceholderText("Search resources, owners, IDs"));
    await user.type(screen.getByPlaceholderText("Search resources, owners, IDs"), "new");
    await waitFor(() => expect(listResourcesMock).toHaveBeenCalledTimes(2));
    resolveFirst!({ items: [], pageInfo: { page: 1, pageSize: 10, totalItems: 0, totalPages: 0 } });

    await waitFor(() => {
      // WHY: a late response or failed request must not restore obsolete results
      // or empty-query commands while the operator is searching.
      expect(screen.queryByText("Overview")).toBeNull();
    });
  });
});
