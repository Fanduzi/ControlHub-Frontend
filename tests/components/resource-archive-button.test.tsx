import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceArchiveButton } from "@/components/resources/resource-archive-button";
import messages from "@/messages/en.json";
import type { ResourceListViewModel } from "@/types/view-models";

const { archiveMock, unarchiveMock } = vi.hoisted(() => ({
  archiveMock: vi.fn(),
  unarchiveMock: vi.fn(),
}));

vi.mock("@/services/resources", () => ({
  archiveResource: archiveMock,
  unarchiveResource: unarchiveMock,
}));

const activeResource: ResourceListViewModel = {
  id: "res-1",
  resourceType: "service",
  resourceSubtype: "api",
  name: "orders-api",
  displayName: "Orders API",
  environmentId: "env-prod",
  ownerId: "owner-app",
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
  id: "res-2",
  name: "old-api",
  displayName: "Old API",
  archivedAt: "2026-04-14T12:00:00Z",
  archivedBy: "admin",
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
    vi.resetAllMocks();
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

    it("calls archiveResource and fires onArchiveChange on confirm", async () => {
      const user = userEvent.setup();
      const onArchiveChange = vi.fn();
      archiveMock.mockResolvedValue({ ...archivedResource });

      renderArchiveButton(activeResource, onArchiveChange);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      expect(archiveMock).toHaveBeenCalledWith("res-1", undefined);
      expect(onArchiveChange).toHaveBeenCalled();
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

      expect(archiveMock).toHaveBeenCalledWith("res-1", "Decommissioned");
    });

    it("shows error on archive failure", async () => {
      const user = userEvent.setup();
      archiveMock.mockRejectedValue(new Error("Request failed: 404"));

      renderArchiveButton(activeResource);

      await user.click(screen.getByRole("button", { name: "Archive" }));
      await user.click(screen.getAllByRole("button", { name: "Archive" }).pop()!);

      expect(
        await screen.findByText("The target resource was not found."),
      ).toBeInTheDocument();
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

    it("calls unarchiveResource and fires onArchiveChange", async () => {
      const user = userEvent.setup();
      const onArchiveChange = vi.fn();
      unarchiveMock.mockResolvedValue({ ...activeResource });

      renderArchiveButton(archivedResource, onArchiveChange);

      await user.click(screen.getByRole("button", { name: "Restore" }));

      expect(unarchiveMock).toHaveBeenCalledWith("res-2");
      expect(onArchiveChange).toHaveBeenCalled();
    });

    it("shows error on unarchive failure", async () => {
      const user = userEvent.setup();
      unarchiveMock.mockRejectedValue(new Error("Request failed: 404"));

      renderArchiveButton(archivedResource);

      await user.click(screen.getByRole("button", { name: "Restore" }));

      expect(
        await screen.findByText("The target resource was not found."),
      ).toBeInTheDocument();
    });
  });
});
