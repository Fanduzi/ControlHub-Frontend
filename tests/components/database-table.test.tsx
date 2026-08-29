import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DatabaseTable } from "@/components/databases/database-table";
import { databaseRowMatchesSearch } from "@/components/databases/database-table";
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
  overrides?: Partial<ResourceListViewModel>,
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
    ...overrides,
  };
}

function makeInstance(
  id: number,
  name: string,
  clusterId: number | undefined,
  profile?: { hostname?: string; port?: number; role?: string; engine?: string; version?: string },
  overrides?: Partial<ResourceListViewModel>,
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
    ...overrides,
  };
}

describe("DatabaseTable", () => {
  it("renders instance hostname and port under resource name", () => {
    const resources: ResourceListViewModel[] = [
      {
        ...makeInstance(10, "Orders Primary", undefined, {
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
    expect(screen.getByText(":3306")).toBeInTheDocument();
  });

  it("renders database proxy rows in the estate table", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 1),
      makeInstance(10, "Orders Primary", 1),
      {
        ...makeInstance(75, "Orders ProxySQL", undefined, {
          hostname: "proxy-prod-01",
          port: 6033,
          role: "active",
        }),
        resourceType: "database_proxy",
        resourceSubtype: "proxysql",
        clusterId: undefined,
        displayName: "Orders ProxySQL",
        name: "orders-proxysql-01",
      },
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Orders ProxySQL")).toBeInTheDocument();
    expect(screen.getByText("proxy-prod-01")).toBeInTheDocument();
    expect(screen.getByText(":6033")).toBeInTheDocument();
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

  it("renders display names as primary text for standalone instances", () => {
    const resources: ResourceListViewModel[] = [
      {
        ...makeInstance(20, "Standalone DB", undefined),
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
  });

  it("renders operational signal column header", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Operational signal")).toBeInTheDocument();
  });

  it("does not render standalone hostname and port column headers", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
      makeInstance(10, "Orders Primary", 1, { hostname: "db-01.internal", port: 3306 }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    const headers = screen.getAllByRole("columnheader");
    const headerTexts = headers.map((h) => h.textContent);
    expect(headerTexts).not.toContain("Hostname");
    expect(headerTexts).not.toContain("Port");
  });

  it("shows needs attention signal for cluster with critical member", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(14, "Analytics ClickHouse Cluster Production", 2, {
        databaseOperationalSummary: {
          memberCount: 2,
          criticalMemberCount: 1,
          warningMemberCount: 0,
          stoppedMemberCount: 0,
          degradedMemberCount: 0,
          unknownRoleCount: 0,
          primaryMemberCount: 0,
          replicaMemberCount: 2,
          worstMemberId: 23,
          worstMemberName: "Analytics ClickHouse Node 02",
          worstMemberStatus: "critical",
        },
      }),
      makeInstance(22, "Analytics ClickHouse Node 01 Production", 14, {
        hostname: "prod-ch-host-01.internal",
        port: 8123,
        role: "replica",
      }),
      makeInstance(23, "Analytics ClickHouse Node 02", 14, {
        hostname: "prod-ch-host-02.internal",
        port: 8123,
        role: "replica",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={2} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("1 critical member")).toBeInTheDocument();
    expect(screen.getByText(/Triggered by Analytics ClickHouse Node 02/)).toBeInTheDocument();
  });

  it("shows healthy signal for cluster with no abnormal members", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Order MySQL Cluster", 2, {
        databaseOperationalSummary: {
          memberCount: 2,
          criticalMemberCount: 0,
          warningMemberCount: 0,
          stoppedMemberCount: 0,
          degradedMemberCount: 0,
          unknownRoleCount: 0,
          primaryMemberCount: 1,
          replicaMemberCount: 1,
        },
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("All members are healthy")).toBeInTheDocument();
    const healthySignals = screen.getAllByText("Healthy");
    expect(healthySignals.length).toBeGreaterThanOrEqual(1);
  });

  it("shows resource status hint on cluster with healthy self but critical members", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(14, "CH Cluster", 2, {
        databaseOperationalSummary: {
          memberCount: 2,
          criticalMemberCount: 1,
          warningMemberCount: 0,
          stoppedMemberCount: 0,
          degradedMemberCount: 0,
          unknownRoleCount: 0,
          primaryMemberCount: 0,
          replicaMemberCount: 2,
        },
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText(/Resource itself is healthy/)).toBeInTheDocument();
  });

  it("shows instance critical signal reason with subject", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(23, "Analytics ClickHouse Node 02", undefined, {
        hostname: "prod-ch-host-02.internal",
        port: 8123,
        role: "replica",
      }, {
        healthStatus: "critical",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Instance resource status is critical")).toBeInTheDocument();
  });

  it("shows instance attention signal reason for warning health", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(23, "Slow Node", undefined, {
        hostname: "slow-host.internal",
        port: 3306,
        role: "replica",
      }, {
        healthStatus: "warning",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Instance resource status is warning")).toBeInTheDocument();
  });

  it("shows instance healthy signal reason for healthy instance without summary", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(22, "Healthy Node", undefined, {
        hostname: "healthy.internal",
        port: 3306,
        role: "primary",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Instance is healthy")).toBeInTheDocument();
  });

  it("shows localized role via profileFields keys", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(22, "Primary Node", undefined, {
        hostname: "primary.internal",
        port: 3306,
        role: "primary",
      }),
      makeInstance(23, "Replica Node", undefined, {
        hostname: "replica.internal",
        port: 3306,
        role: "replica",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={2} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Replica")).toBeInTheDocument();
  });

  it("shows instance stopped signal reason", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(30, "Stopped Node", undefined, {
        hostname: "stopped.internal",
        port: 3306,
      }, {
        lifecycleStatus: "stopped",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Instance is stopped")).toBeInTheDocument();
  });

  it("shows instance degraded signal reason", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(31, "Degraded Node", undefined, {
        hostname: "degraded.internal",
        port: 3306,
      }, {
        lifecycleStatus: "degraded",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Instance lifecycle is degraded")).toBeInTheDocument();
  });

  it("shows cluster summary unavailable when cluster has no summary", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(99, "Orphan Cluster", undefined),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Status unknown")).toBeInTheDocument();
    expect(screen.getByText("Member summary unavailable")).toBeInTheDocument();
  });

  it("does not show 'No data' for healthy instance with host and profile", () => {
    const resources: ResourceListViewModel[] = [
      makeInstance(22, "Healthy Node", undefined, {
        hostname: "healthy.internal",
        port: 3306,
        role: "primary",
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={0} totalInstances={1} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("No data")).not.toBeInTheDocument();
    expect(screen.getByText("Instance is healthy")).toBeInTheDocument();
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

  it("renders signal filter and sort controls alongside engine filter", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText("Operational signal")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort")).toBeInTheDocument();
    expect(screen.getAllByText("Engine").length).toBeGreaterThanOrEqual(1);
  });

  it("shows localized sort label by default instead of raw enum", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    const sortTrigger = screen.getByLabelText("Sort");
    expect(sortTrigger).toHaveTextContent("Abnormal first");
    expect(sortTrigger).not.toHaveTextContent("abnormal_first");
  });

  it("does not render raw sort enum values in the DOM", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("abnormal_first")).not.toBeInTheDocument();
  });

  it("shows localized signal filter label by default instead of raw enum", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    const signalTrigger = screen.getByLabelText("Operational signal");
    expect(signalTrigger).toHaveTextContent("All signals");
    expect(signalTrigger).not.toHaveTextContent("all");
  });

  it("does not render raw signal enum values in the DOM", () => {
    const resources: ResourceListViewModel[] = [
      makeCluster(1, "Orders Cluster", 3),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={1} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    expect(screen.queryByText("needs_attention")).not.toBeInTheDocument();
    expect(screen.queryByText("healthy")).not.toBeInTheDocument();
    expect(screen.queryByText("unknown")).not.toBeInTheDocument();
  });

  it("shows signal counts in filter dropdown options", async () => {
    const user = userEvent.setup();
    const resources: ResourceListViewModel[] = [
      makeCluster(14, "CH Cluster", 2, {
        databaseOperationalSummary: {
          memberCount: 2, criticalMemberCount: 1, warningMemberCount: 0,
          stoppedMemberCount: 0, degradedMemberCount: 0, unknownRoleCount: 0,
          primaryMemberCount: 0, replicaMemberCount: 2,
        },
      }),
      makeCluster(1, "MySQL Cluster", 2, {
        databaseOperationalSummary: {
          memberCount: 2, criticalMemberCount: 0, warningMemberCount: 0,
          stoppedMemberCount: 0, degradedMemberCount: 0, unknownRoleCount: 0,
          primaryMemberCount: 1, replicaMemberCount: 1,
        },
      }),
    ];

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <DatabaseTable resources={resources} totalClusters={2} totalInstances={0} />
      </NextIntlClientProvider>,
    );

    await user.click(screen.getByLabelText("Operational signal"));
    expect(screen.getByText("Needs attention (1)")).toBeInTheDocument();
    expect(screen.getByText("Healthy (1)")).toBeInTheDocument();
  });
});

describe("databaseRowMatchesSearch", () => {
  const clusterWithChildren: ResourceListViewModel & { subRows?: ResourceListViewModel[] } = {
    ...makeCluster(14, "Analytics CH Cluster", 2),
    subRows: [
      makeInstance(22, "Node 01", 14, {
        hostname: "prod-ch-host-01.internal",
        port: 8123,
        role: "replica",
      }),
      makeInstance(23, "Node 02", 14, {
        hostname: "prod-ch-host-02.internal",
        port: 8123,
        role: "replica",
      }),
    ],
  };

  it("matches display name", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "Analytics")).toBe(true);
  });

  it("matches instance hostname in subRows", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "prod-ch-host-02.internal")).toBe(true);
  });

  it("matches port in subRows", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "8123")).toBe(true);
  });

  it("matches role in subRows", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "replica")).toBe(true);
  });

  it("matches resourceSubtype", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "mysql")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(databaseRowMatchesSearch(clusterWithChildren, "postgresql")).toBe(false);
  });

  it("matches standalone instance hostname", () => {
    const instance = makeInstance(22, "Node 01", undefined, {
      hostname: "prod-ch-host-01.internal",
      port: 8123,
      role: "replica",
    });
    expect(databaseRowMatchesSearch(instance, "prod-ch-host-01.internal")).toBe(true);
  });

  it("matches standalone instance port", () => {
    const instance = makeInstance(22, "Node 01", undefined, {
      hostname: "prod-ch-host-01.internal",
      port: 8123,
    });
    expect(databaseRowMatchesSearch(instance, "8123")).toBe(true);
  });
});
