// input: vitest, testing-library, command palette, auth-role
// output: command palette tests — resource search/routing, create-resource admin gating, and operator navigation
// pos: component tests for the console command palette affordance gating
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import userEvent from "@testing-library/user-event";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/app-shell/command-palette";
import messages from "@/messages/en.json";

let isAdmin = true;
const { listResourcesMock, routerPushMock } = vi.hoisted(() => ({
  listResourcesMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));

vi.mock("@/services/resources", () => ({
  listResources: listResourcesMock,
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

  it("searches resources through the list service and opens the selected resource", async () => {
    listResourcesMock.mockResolvedValue({
      items: [{ id: 79, displayName: "Orders API", resourceType: "service" }],
      pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    const user = userEvent.setup();

    renderPalette();
    await user.type(screen.getByPlaceholderText("Search resources, owners, IDs"), "orders");

    await waitFor(() => {
      expect(listResourcesMock).toHaveBeenCalledWith({ q: "orders", pageSize: 20 });
    });
    await user.click(await screen.findByText("Orders API"));

    expect(routerPushMock).toHaveBeenCalledWith("/resources/79");
  });
});
