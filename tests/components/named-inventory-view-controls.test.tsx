// input: Vitest, testing-library, named inventory view controls, mocked service/router
// output: saved inventory-view save/apply regression tests
// pos: component tests for URL-state round-tripping of named inventory views
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NamedInventoryViewControls } from "@/components/resources/named-inventory-view-controls";
import messages from "@/messages/en.json";
import type { NamedInventoryView } from "@/types/named-inventory-view";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  createNamedInventoryView: vi.fn(),
  listNamedInventoryViews: vi.fn(),
  currentSearch: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/resources",
  useSearchParams: () => new URLSearchParams(mocks.currentSearch),
}));

vi.mock("@/services/named-inventory-views", () => ({
  createNamedInventoryView: mocks.createNamedInventoryView,
  listNamedInventoryViews: mocks.listNamedInventoryViews,
}));

const personalView: NamedInventoryView = {
  id: 1,
  name: "My production view",
  scope: "personal",
  state: {
    filters: { q: "orders" },
    sort: { field: "name", direction: "asc" },
    columns: ["displayName"],
  },
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
};

const sharedView: NamedInventoryView = {
  ...personalView,
  id: 2,
  name: "Shared production",
  scope: "shared",
  state: {
    ...personalView.state,
    filters: {
      q: "legacy filter",
      resourceType: ["retired_type", "service"],
      resourceSubtype: ["legacy_subtype"],
      environmentId: 42,
      lifecycleStatus: ["retired"],
      healthStatus: ["unknown", "critical"],
      includeArchived: true,
    },
  },
};

function renderControls() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NamedInventoryViewControls columns={["displayName", "status"]} />
    </NextIntlClientProvider>,
  );
}

describe("NamedInventoryViewControls", () => {
  beforeEach(() => {
    mocks.currentSearch = "q=orders&resourceType=service&resourceType=database_instance&resourceSubtype=mysql&lifecycleStatus=running&healthStatus=warning&environmentId=7&archiveFilter=includeArchived&page=3";
    mocks.replace.mockReset();
    mocks.createNamedInventoryView.mockReset();
    mocks.listNamedInventoryViews.mockReset().mockResolvedValue({
      items: [personalView, sharedView],
      canManageShared: false,
    });
  });

  it("saves the raw resource URL filters as a personal view and refetches", async () => {
    const user = userEvent.setup();
    mocks.createNamedInventoryView.mockResolvedValue(personalView);
    renderControls();

    await user.type(screen.getByLabelText("View name"), "  My filters  ");
    await user.click(screen.getByRole("button", { name: "Save view" }));

    await waitFor(() => {
      expect(mocks.createNamedInventoryView).toHaveBeenCalledWith({
        name: "My filters",
        scope: "personal",
        state: {
          filters: {
            q: "orders",
            resourceType: ["service", "database_instance"],
            resourceSubtype: ["mysql"],
            environmentId: 7,
            lifecycleStatus: ["running"],
            healthStatus: ["warning"],
            includeArchived: true,
          },
          sort: { field: "name", direction: "asc" },
          columns: ["displayName", "status"],
        },
      });
      expect(mocks.listNamedInventoryViews).toHaveBeenCalledTimes(2);
    });
  });

  it("shows shared views with their localized distinction", async () => {
    renderControls();

    expect(await screen.findByRole("option", { name: "Shared production (Shared)" })).toBeInTheDocument();
  });

  it("applies every saved filter value, including stale repeated values, and resets page", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Saved views" }),
      "2",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/resources?q=legacy+filter&resourceType=retired_type&resourceType=service&resourceSubtype=legacy_subtype&environmentId=42&lifecycleStatus=retired&healthStatus=unknown&healthStatus=critical&includeArchived=true&page=1",
    );
  });
});
