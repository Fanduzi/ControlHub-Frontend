import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatabaseTable } from "@/components/databases/database-table";
import { formatDateTime } from "@/lib/format";
import messages from "@/messages/en.json";
import type { ResourceListViewModel } from "@/types/view-models";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/databases",
  useSearchParams: () => new URLSearchParams("page=1"),
}));

vi.mock("@/components/resources/resource-detail-sheet-loader", () => ({
  ResourceDetailSheetLoader: ({
    open,
    resource,
  }: {
    open: boolean;
    resource: ResourceListViewModel | null;
  }) => (open && resource ? <div role="dialog">{resource.displayName}</div> : null),
}));

function makeCluster(
  id: number,
  name: string,
  nodeCount?: number,
): ResourceListViewModel {
  return {
    id,
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    name,
    displayName: name,
    environmentId: 1,
    ownerId: 1,
    ownerName: "DBA Team",
    environmentName: "Production",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    createdAt: "2026-04-14T10:00:00Z",
    updatedAt: "2026-04-14T10:00:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    isArchived: false,
    summary: "Cluster",
    profileSummary: nodeCount != null ? { nodeCount } : undefined,
  };
}

function makeInstance(
  id: number,
  name: string,
  clusterId: number,
  profile?: { hostname?: string; port?: number },
): ResourceListViewModel {
  return {
    id,
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    name,
    displayName: name,
    environmentId: 1,
    ownerId: 1,
    ownerName: "DBA Team",
    environmentName: "Production",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "",
    labels: {},
    createdAt: "2026-04-14T10:00:00Z",
    updatedAt: "2026-04-14T10:00:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    isArchived: false,
    summary: "Instance",
    clusterId,
    profileSummary: profile,
  };
}

describe("DatabaseTable", () => {
  it("renders profile summary hostname and port from backend data", () => {
    const resources: ResourceListViewModel[] = [
      {
        ...makeInstance(10, "Orders Primary", 0, {
          hostname: "db-prod-01.internal",
          port: 3306,
        }),
        clusterId: undefined,
      },
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("db-prod-01.internal")).toBeInTheDocument();
    expect(screen.getByText("3306")).toBeInTheDocument();
  });

  it("renders cluster node count from backend profile summary", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
      makeInstance(10, "Orders Primary", 1),
      makeInstance(11, "Orders Replica", 1),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={2} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/3 nodes/i)).toBeInTheDocument();
  });

  it("renders display names as primary text for standalone instances, not UUIDs or raw IDs", () => {
    // Instance with no cluster — appears as top-level row
    const resources: ResourceListViewModel[] = [
      {
        ...makeInstance(20, "Standalone DB", 0),
        clusterId: undefined,
      },
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    const body = screen.getByRole("table").querySelector("tbody");
    expect(body?.textContent).toContain("Standalone DB");
  });

  it("renders updated timestamps using the active locale", () => {
    const resources: ResourceListViewModel[] = [
      {
        id: 1,
        resourceType: "database_instance",
        resourceSubtype: "mysql",
        name: "orders-primary",
        displayName: "Orders MySQL Primary",
        environmentId: 100,
        ownerId: 200,
        ownerName: "DBA Team",
        environmentName: "Production",
        lifecycleStatus: "running",
        healthStatus: "healthy",
        source: "manual",
        externalId: "db:orders-primary",
        labels: {},
        createdAt: "2026-04-14T10:00:00Z",
        updatedAt: "2026-04-14T10:00:00Z",
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        isArchived: false,
        summary: "Orders primary database",
      },
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable
          resources={resources}
          totalClusters={0}
          totalInstances={1}
        />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByText(formatDateTime("2026-04-14T10:00:00Z", "en")),
    ).toBeInTheDocument();
  });

  it("uses resource-status column header instead of generic status", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Resource status")).toBeInTheDocument();
    expect(screen.queryByText("Status")).not.toBeInTheDocument();
  });

  it("shows status hint on cluster rows but not instance rows", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
      makeInstance(10, "Orders Primary", 1),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    const hints = screen.getAllByText(/Resource self status only/i);
    expect(hints).toHaveLength(1);
  });

  it("opens the resource detail sheet when a database row is clicked", async () => {
    const user = userEvent.setup();
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
      makeInstance(10, "Orders Primary", 1),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByRole("row", { name: /view details for orders cluster/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent("Orders Cluster");
  });
});
