// input: Vitest, testing-library, named inventory view controls, mocked service/router
// output: repeated-filter saved inventory-view save, apply, and management regression tests
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
  updateNamedInventoryView: vi.fn(),
  deleteNamedInventoryView: vi.fn(),
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
  updateNamedInventoryView: mocks.updateNamedInventoryView,
  deleteNamedInventoryView: mocks.deleteNamedInventoryView,
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
      environmentId: [42, 43],
      lifecycleStatus: ["retired"],
      healthStatus: ["unknown", "critical"],
      ownerId: 77,
      label: ["team:legacy", "tier:1"],
      includeArchived: true,
    },
  },
};

function renderControls(onApplyColumns = vi.fn()) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <NamedInventoryViewControls
        columns={["displayName", "status"]}
        onApplyColumns={onApplyColumns}
      />
    </NextIntlClientProvider>,
  );
}

describe("NamedInventoryViewControls", () => {
  beforeEach(() => {
    mocks.currentSearch = "q=orders&resourceType=service&resourceType=database_instance&resourceSubtype=mysql&lifecycleStatus=running&healthStatus=warning&environmentId=7&environmentId=8&environmentId=0&environmentId=-1&environmentId=9007199254740992&environmentId=invalid&ownerId=42&label=team%3Apayments&label=tier%3A1&archiveFilter=includeArchived&page=3";
    mocks.replace.mockReset();
    mocks.createNamedInventoryView.mockReset();
    mocks.updateNamedInventoryView.mockReset();
    mocks.deleteNamedInventoryView.mockReset();
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
            environmentId: [7, 8],
            lifecycleStatus: ["running"],
            healthStatus: ["warning"],
            ownerId: 42,
            label: ["team:payments", "tier:1"],
            includeArchived: true,
          },
          sort: { field: "name", direction: "asc" },
          columns: ["displayName", "status"],
        },
      });
      expect(mocks.listNamedInventoryViews).toHaveBeenCalledTimes(2);
    });
  });

  it("lets an admin save the current filters as a shared view", async () => {
    const user = userEvent.setup();
    mocks.listNamedInventoryViews.mockResolvedValue({
      items: [personalView, sharedView],
      canManageShared: true,
    });
    mocks.createNamedInventoryView.mockResolvedValue(sharedView);
    renderControls();

    await user.type(await screen.findByLabelText("View name"), "Team filters");
    await user.selectOptions(screen.getByLabelText("View scope"), "shared");
    await user.click(screen.getByRole("button", { name: "Save view" }));

    await waitFor(() => {
      expect(mocks.createNamedInventoryView).toHaveBeenCalledWith({
        name: "Team filters",
        scope: "shared",
        state: {
          filters: {
            q: "orders",
            resourceType: ["service", "database_instance"],
            resourceSubtype: ["mysql"],
            environmentId: [7, 8],
            lifecycleStatus: ["running"],
            healthStatus: ["warning"],
            ownerId: 42,
            label: ["team:payments", "tier:1"],
            includeArchived: true,
          },
          sort: { field: "name", direction: "asc" },
          columns: ["displayName", "status"],
        },
      });
    });
  });

  it("shows shared views with their localized distinction", async () => {
    renderControls();

    expect(await screen.findByRole("option", { name: "Shared production (Shared)" })).toBeInTheDocument();
  });

  it("applies every saved filter value, including stale repeated values, and resets page", async () => {
    const user = userEvent.setup();
    const onApplyColumns = vi.fn();
    renderControls(onApplyColumns);

    await user.selectOptions(
      await screen.findByRole("combobox", { name: "Saved views" }),
      "2",
    );
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/resources?q=legacy+filter&resourceType=retired_type&resourceType=service&resourceSubtype=legacy_subtype&environmentId=42&environmentId=43&lifecycleStatus=retired&healthStatus=unknown&healthStatus=critical&ownerId=77&label=team%3Alegacy&label=tier%3A1&includeArchived=true&page=1",
    );
    expect(onApplyColumns).toHaveBeenCalledWith(sharedView.state.columns);
  });

  it("renames a personal view without changing its saved state and refetches", async () => {
    const user = userEvent.setup();
    mocks.updateNamedInventoryView.mockResolvedValue({ ...personalView, name: "Renamed view" });
    renderControls();

    await user.selectOptions(await screen.findByLabelText("Saved views"), "1");
    await user.clear(screen.getByLabelText("Rename view"));
    await user.type(screen.getByLabelText("Rename view"), "Renamed view");
    await user.click(screen.getByRole("button", { name: "Rename" }));

    await waitFor(() => {
      expect(mocks.updateNamedInventoryView).toHaveBeenCalledWith(1, {
        name: "Renamed view",
        state: personalView.state,
      });
      expect(mocks.listNamedInventoryViews).toHaveBeenCalledTimes(2);
    });
  });

  it("deletes a selected personal view, clears selection, and refetches", async () => {
    const user = userEvent.setup();
    mocks.deleteNamedInventoryView.mockResolvedValue(undefined);
    renderControls();

    await user.selectOptions(await screen.findByLabelText("Saved views"), "1");
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(mocks.deleteNamedInventoryView).toHaveBeenCalledWith(1);
      expect(mocks.listNamedInventoryViews).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText("Saved views")).toHaveValue("");
  });

  it("keeps shared views applyable while disabling non-admin management controls", async () => {
    const user = userEvent.setup();
    renderControls();

    await user.selectOptions(await screen.findByLabelText("Saved views"), "2");

    expect(screen.getByRole("button", { name: "Apply" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Rename" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    expect(screen.getByText("Only administrators can manage shared views.")).toBeInTheDocument();
  });
});
