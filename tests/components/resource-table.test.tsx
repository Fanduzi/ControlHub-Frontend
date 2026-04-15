import { NextIntlClientProvider } from "next-intl";
import { formatDateTime } from "@/lib/format";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ResourceTable } from "@/components/resources/resource-table";
import messages from "@/messages/en.json";
import type { ResourceTypeDefinition } from "@/types/settings";
import type { ResourceListViewModel } from "@/types/view-models";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/resources",
  useSearchParams: () => new URLSearchParams("environmentId=env-prod&page=3"),
}));

vi.mock("@/components/resources/resource-detail-sheet-loader", () => ({
  ResourceDetailSheetLoader: () => null,
}));

function renderTable() {
  const resources: ResourceListViewModel[] = [
    {
      id: "resource-1",
      resourceType: "service",
      resourceSubtype: "api",
      name: "orders-api",
      displayName: "Orders API",
      environmentId: "env-prod",
      ownerId: "owner-app",
      ownerName: "Applications",
      environmentName: "Production",
      lifecycleStatus: "running",
      healthStatus: "warning",
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
    },
  ];

  const resourceTypes: ResourceTypeDefinition[] = [
    {
      key: "service",
      label: "Service",
      description: "Service resources",
    },
  ];

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ResourceTable
        resources={resources}
        pageInfo={{
          page: 3,
          pageSize: 20,
          totalItems: 40,
          totalPages: 2,
        }}
        resourceTypes={resourceTypes}
      />
    </NextIntlClientProvider>,
  );
}

describe("ResourceTable", () => {
  beforeEach(() => {
    replace.mockClear();
  });

  it("updates q in the URL and resets to the first page when searching", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.type(
      screen.getByPlaceholderText("Search resource, owner, or ID"),
      "billing",
    );

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&q=billing",
    );
  });

  it("updates resourceType in the URL and resets to the first page when filtering", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Filter type" }));
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&resourceType=service",
    );
  });

  it("updates lifecycleStatus in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Lifecycle status" }));
    await user.click(await screen.findByRole("option", { name: "Running" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&lifecycleStatus=running",
    );
  });

  it("updates healthStatus in the URL and resets to the first page", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Health status" }));
    await user.click(await screen.findByRole("option", { name: "Warning" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&healthStatus=warning",
    );
  });

  it("renders updated timestamps using the active locale", () => {
    const expected = formatDateTime("2026-04-14T10:00:00Z", "en");

    renderTable();

    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("updates archiveFilter to includeArchived in the URL when archive filter changes", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Archive state" }));
    await user.click(await screen.findByRole("option", { name: "Include archived" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&archiveFilter=includeArchived",
    );
  });

  it("updates archiveFilter to archivedOnly in the URL when archived-only is selected", async () => {
    const user = userEvent.setup();

    renderTable();

    await user.click(screen.getByRole("combobox", { name: "Archive state" }));
    await user.click(await screen.findByRole("option", { name: "Archived only" }));

    expect(replace).toHaveBeenLastCalledWith(
      "/resources?environmentId=env-prod&page=1&archiveFilter=archivedOnly",
    );
  });

  it("renders Archived badge for archived resources", () => {
    const archivedResource: ResourceListViewModel = {
      id: "resource-archived",
      resourceType: "service",
      resourceSubtype: "api",
      name: "old-api",
      displayName: "Old API",
      environmentId: "env-prod",
      ownerId: "owner-app",
      ownerName: "Applications",
      environmentName: "Production",
      lifecycleStatus: "retired",
      healthStatus: "healthy",
      source: "manual",
      externalId: "svc:old-api",
      labels: {},
      createdAt: "2026-04-14T10:00:00Z",
      updatedAt: "2026-04-14T10:00:00Z",
      archivedAt: "2026-04-14T12:00:00Z",
      archivedBy: "admin",
      archiveReason: "Retired",
      isArchived: true,
      summary: "Old API summary",
    };

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ResourceTable
          resources={[archivedResource]}
          pageInfo={{ page: 1, pageSize: 20, totalItems: 1, totalPages: 1 }}
          resourceTypes={[]}
        />
      </NextIntlClientProvider>,
    );

    const badges = screen.getAllByText("Archived");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });
});
