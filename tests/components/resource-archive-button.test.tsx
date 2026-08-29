// input: vitest, testing-library, resource archive button, auth-role
// output: admin archive/restore control tests; non-admin operators see no mutation affordance
// pos: component tests for role-gated resource mutations
// note: if this file changes, update header and tests/components/README.md
import { NextIntlClientProvider } from "next-intl";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/services/api-client";
import { ResourceArchiveButton } from "@/components/resources/resource-archive-button";

import messages from "@/messages/en.json";
import type { ResourceListViewModel } from "@/types/view-models";

let isAdmin = true;
vi.mock("@/lib/auth-role", () => ({
  useAdminRole: () => isAdmin,
}));
const { archiveMock, refreshMock, unarchiveMock } = vi.hoisted(() => ({
  archiveMock: vi.fn(),
  refreshMock: vi.fn(),
  unarchiveMock: vi.fn(),
}));

vi.mock("@/services/resources", () => ({
  archiveResource: archiveMock,
  unarchiveResource: unarchiveMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const activeResource: ResourceListViewModel = {
  id: 1,
  resourceType: "service",
  resourceSubtype: "api",
  name: "orders-api",
  displayName: "Orders API",
  environmentId: 1,
  ownerId: 1,
  ownerName: "Applications",
  environmentName: "Production",
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "svc:orders-api",
  labels: {},
  createdAt: "2026-04-14T10:00:00Z",
  updatedAt: "2026-04-14T10:00:00Z",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  summary: "Orders API summary",
};

const archivedResource: ResourceListViewModel = {
  ...activeResource,
  id: 2,
  name: "old-api",
  displayName: "Old API",
  archivedAt: "2026-04-14T12:00:00Z",
  archivedBy: 1,
  archiveReason: "Retired",
  isArchived: true,
};

function renderArchiveButton(
  resource: ResourceListViewModel,
  onArchiveChange?: () => void,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResourceArchiveButton
        resource={resource}
        onArchiveChange={onArchiveChange}
      />
    </NextIntlClientProvider>,
  );
}

describe("ResourceArchiveButton", () => {
  beforeEach(() => {
    isAdmin = true;
    vi.resetAllMocks();
  });

  it("renders no mutation affordance for non-admin operators", () => {
    isAdmin = false;

    renderArchiveButton(activeResource);

    expect(screen.queryByRole("button", { name: /archive/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /restore/i })).toBeNull();
  });

  describe("active resource", () => {
    it("renders Archive button initially", () => {
      renderArchiveButton(activeResource);

      expect(
        screen.getByRole("button", { name: "Archive" }),
      ).toBeInTheDocument();
    });

    it("shows confirmation form on click", async () => {
      const user = userEvent.setup();
      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));

      expect(
        screen.getByPlaceholderText("Optional reason for archiving"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Archive" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" }),
      ).toBeInTheDocument();
    });

    it("refreshes before firing onArchiveChange after archive success", async () => {
      const user = userEvent.setup();
      const events: string[] = [];
      const onArchiveChange = vi.fn(() => events.push("callback"));
      archiveMock.mockImplementation(async () => {
        events.push("archive");
        return { ...archivedResource };
      });
      refreshMock.mockImplementation(() => events.push("refresh"));

      renderArchiveButton(activeResource, onArchiveChange);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      expect(archiveMock).toHaveBeenCalledWith(1, undefined);
      expect(events).toEqual(["archive", "refresh", "callback"]);
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(onArchiveChange).toHaveBeenCalledTimes(1);
    });

    it("refreshes server components after archive success without a callback", async () => {
      const user = userEvent.setup();
      archiveMock.mockResolvedValue({ ...archivedResource });

      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    });

    it("calls archiveResource with reason when provided", async () => {
      const user = userEvent.setup();
      archiveMock.mockResolvedValue({ ...archivedResource });

      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.type(
        screen.getByPlaceholderText("Optional reason for archiving"),
        "Decommissioned",
      );
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      expect(archiveMock).toHaveBeenCalledWith(1, "Decommissioned");
    });

    it("prevents duplicate archive submissions while the request is pending", async () => {
      const user = userEvent.setup();
      let resolveArchive: (resource: ResourceListViewModel) => void = () => undefined;
      archiveMock.mockImplementation(
        () => new Promise((resolve) => { resolveArchive = resolve; }),
      );

      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      const confirmButton = screen.getAllByRole("button", { name: "Archive" }).pop()!;
      await user.click(confirmButton);
      expect(confirmButton).toBeDisabled();

      await user.click(confirmButton);
      expect(archiveMock).toHaveBeenCalledTimes(1);

      resolveArchive({ ...archivedResource });
      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    });

    it("shows error on archive failure", async () => {
      const user = userEvent.setup();
      const onArchiveChange = vi.fn();
      archiveMock.mockRejectedValue(new ApiError(404, "Not Found"));

      renderArchiveButton(activeResource, onArchiveChange);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      expect(
        await screen.findByText("The target resource was not found."),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Optional reason for archiving")).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
      expect(onArchiveChange).not.toHaveBeenCalled();
    });

    it("dismisses confirmation on Cancel", async () => {
      const user = userEvent.setup();
      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      expect(
        screen.getByPlaceholderText("Optional reason for archiving"),
      ).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByPlaceholderText("Optional reason for archiving"),
      ).not.toBeInTheDocument();
    });
  });

  describe("archived resource", () => {
    it("renders Restore button", () => {
      renderArchiveButton(archivedResource);

      expect(
        screen.getByRole("button", { name: "Restore" }),
      ).toBeInTheDocument();
    });

    it("refreshes before firing onArchiveChange after restore success", async () => {
      const user = userEvent.setup();
      const events: string[] = [];
      const onArchiveChange = vi.fn(() => events.push("callback"));
      unarchiveMock.mockImplementation(async () => {
        events.push("restore");
        return { ...activeResource, id: 2 };
      });
      refreshMock.mockImplementation(() => events.push("refresh"));

      renderArchiveButton(archivedResource, onArchiveChange);

      // First click opens confirmation
      await user.click(screen.getByRole("button", { name: "Restore" }));

      // Second click confirms the unarchive
      const confirmButtons = screen.getAllByRole("button", { name: "Restore" });
      await user.click(confirmButtons[confirmButtons.length - 1]);

      expect(unarchiveMock).toHaveBeenCalledWith(2);
      expect(events).toEqual(["restore", "refresh", "callback"]);
      expect(refreshMock).toHaveBeenCalledTimes(1);
      expect(onArchiveChange).toHaveBeenCalledTimes(1);
    });

    it("refreshes server components after restore success without a callback", async () => {
      const user = userEvent.setup();
      unarchiveMock.mockResolvedValue({ ...activeResource, id: 2 });

      renderArchiveButton(archivedResource);

      await user.click(screen.getByRole("button", { name: "Restore" }));
      await user.click(screen.getAllByRole("button", { name: "Restore" }).pop()!);

      await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
    });

    it("shows error on unarchive failure", async () => {
      const user = userEvent.setup();
      const onArchiveChange = vi.fn();
      unarchiveMock.mockRejectedValue(new ApiError(404, "Not Found"));

      renderArchiveButton(archivedResource, onArchiveChange);

      // First click opens confirmation
      await user.click(screen.getByRole("button", { name: "Restore" }));

      // Second click confirms the unarchive (which will fail)
      const confirmButtons = screen.getAllByRole("button", { name: "Restore" });
      await user.click(confirmButtons[confirmButtons.length - 1]);

      expect(
        await screen.findByText("The target resource was not found."),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Restore" })).toBeInTheDocument();
      expect(refreshMock).not.toHaveBeenCalled();
      expect(onArchiveChange).not.toHaveBeenCalled();
    });
  });
});
