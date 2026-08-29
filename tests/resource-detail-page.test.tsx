// input: mocked localized resource detail page dependencies and rendered route fixtures
// output: route-level regression coverage for resource detail rendering and database panels
// pos: app boundary test for the localized resource detail page
// note: if this file changes, update this header and tests/README.md.

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ResourceDetailViewModel } from "@/types/view-models";

const getTranslationsMock = vi.fn();
const getLocaleMock = vi.fn();
const getResourceViewModelMock = vi.fn();
const notFoundMock = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("next-intl/server", () => ({
  getTranslations: getTranslationsMock,
  getLocale: getLocaleMock,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock("@/lib/view-models", () => ({
  getResourceViewModel: getResourceViewModelMock,
}));

vi.mock("@/components/blocks/page-header", () => ({
  PageHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/blocks/detail-panel", () => ({
  DetailPanel: ({ children, className }: { children?: React.ReactNode; className?: string }) => (
    <section className={className}>{children}</section>
  ),
}));

vi.mock("@/components/blocks/activity-timeline", () => ({
  ActivityTimeline: () => <div>activity-timeline</div>,
}));

vi.mock("@/components/blocks/resource-relation-panel", () => ({
  ResourceRelationPanel: () => <div>resource-relation-panel</div>,
}));

vi.mock("@/components/blocks/status-badge", () => ({
  StatusBadge: ({ status }: { status: string }) => <div>{status}</div>,
}));

vi.mock("@/components/blocks/topology-panel", () => ({
  TopologyPanel: ({ resourceId }: { resourceId: number; initialTopology?: unknown }) => (
    <div>topology:{resourceId}</div>
  ),
}));

vi.mock("@/components/resources/resource-detail-edit-button", () => ({
  ResourceDetailEditButton: () => <button>edit</button>,
}));

vi.mock("@/components/resources/resource-archive-button", () => ({
  ResourceArchiveButton: () => <button>archive</button>,
}));

vi.mock("@/components/blocks/cluster-members-table", () => ({
  ClusterMembersTable: ({ members }: { members: Array<{ id: number; displayName: string }> }) => (
    <div data-testid="cluster-members-table">
      {members.map((m) => (
        <span key={m.id} data-member-name>{m.displayName}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/blocks/deployed-resources-card", () => ({
  DeployedResourcesCard: () => <div>deployed-resources</div>,
}));

vi.mock("@/components/ui/breadcrumb", () => ({
  Breadcrumb: ({ children }: { children: React.ReactNode }) => <nav>{children}</nav>,
  BreadcrumbList: ({ children }: { children: React.ReactNode }) => <ol>{children}</ol>,
  BreadcrumbItem: ({ children }: { children: React.ReactNode }) => <li>{children}</li>,
  BreadcrumbSeparator: () => <span>/</span>,
}));

vi.mock("@/components/resources/resources-breadcrumb-link", () => ({
  ResourcesBreadcrumbLink: ({ label }: { label: string }) => <a>{label}</a>,
}));

vi.mock("@/components/blocks/db-type-icon", () => ({
  DbTypeIcon: () => <span>db-icon</span>,
}));

vi.mock("@/i18n/locales", () => ({
  DEFAULT_LOCALE: "en",
  isAppLocale: () => true,
}));

vi.mock("@/lib/format", () => ({
  formatDateTime: (value: string) => value,
  formatLabel: (value: string) => value,
  formatRole: (value: string) =>
    value === "primary" ? "Primary" : value === "replica" ? "Replica" : value,
}));

vi.mock("@/lib/resource-copy", () => ({
  getResourceSummaryKey: () => null,
}));

vi.mock("@/components/resources/database-operator-workbench", () => ({
  DatabaseOperatorWorkbench: ({ resource: r }: { resource: { id: number; resourceType: string } }) => (
    <div data-testid="database-operator-workbench" data-resource-type={r.resourceType}>
      operator-workbench:{r.id}
    </div>
  ),
}));

vi.mock("@/components/resources/database-decision-deck", () => ({
  DatabaseDecisionDeck: ({ resource: r }: { resource: { id: number; resourceType: string } }) => (
    <div data-testid="database-decision-deck" data-resource-type={r.resourceType}>
      decision-deck:{r.id}
    </div>
  ),
}));

vi.mock("@/components/resources/database-consistency-panel", () => ({
  DatabaseConsistencyPanel: ({
    scope,
    result,
  }: {
    scope: "cluster" | "instance";
    result: { status: string };
  }) => (
    <div
      data-testid="database-consistency-panel"
      data-consistency-status={result.status}
      data-consistency-scope={scope}
    >
      consistency-panel:{result.status}:{scope}
    </div>
  ),
}));

vi.mock("@/components/resources/database-instance-facts-panel", () => ({
  DatabaseInstanceFactsPanel: ({ result }: { result: { status: string; facts: { parentClusterName?: string } } }) => (
    <div data-testid="database-instance-facts-panel" data-consistency-status={result.status}>
      instance-facts:{result.facts.parentClusterName ?? "none"}
    </div>
  ),
}));

vi.mock("@/components/resources/database-supporting-details", () => ({
  DatabaseSupportingDetails: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="database-supporting-details">{children}</div>
  ),
}));

vi.mock("@/services/topology", () => ({
  getResourceTopology: vi.fn().mockResolvedValue(null),
}));

function t(key: string) {
  return key;
}
t.has = () => false;

const resource: ResourceDetailViewModel = {
  id: 101,
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: 1,
  environmentName: "Production",
  ownerId: 1,
  ownerName: "DBA Team",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "aws:rds:orders-primary",
  createdAt: "2026-04-11T12:00:00Z",
  updatedAt: "2026-04-11T13:00:00Z",
  labels: { role: "primary" },
  completeness: {
    score: 71,
    status: "partial",
    missingRequirements: ["minimumIdentity", "structuralRelationship"],
  },
  summary: "Primary transactional database handling checkout and order writes.",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  isArchived: false,
  profile: { engine: "MySQL 8.0", role: "replica" },
  relations: [],
  auditEvents: [],
};

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTranslationsMock.mockResolvedValue(t);
    getLocaleMock.mockResolvedValue("en");
    getResourceViewModelMock.mockResolvedValue(resource);
  });

  it("rejects malformed numeric route params", async () => {
    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    await expect(
      ResourceDetailPage({
        params: Promise.resolve({ id: "101oops" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalled();
    expect(getResourceViewModelMock).not.toHaveBeenCalled();
  });

  it("renders server-derived completeness on the full detail page", async () => {
    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: String(resource.id) }),
    });

    render(element);

    expect(screen.getByText("common.completeness.score")).toBeInTheDocument();
    expect(screen.getByText("common.completeness.status.partial")).toBeInTheDocument();
    expect(screen.getByText("minimumIdentity, structuralRelationship")).toBeInTheDocument();
  });

  it("rejects unsafe numeric route params", async () => {
    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    await expect(
      ResourceDetailPage({
        params: Promise.resolve({ id: "9007199254740992" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFoundMock).toHaveBeenCalled();
    expect(getResourceViewModelMock).not.toHaveBeenCalled();
  });

  it("keeps generic topology available after supporting profile content", async () => {
    const genericResource: ResourceDetailViewModel = {
      ...resource,
      resourceType: "service",
      resourceSubtype: "api",
      members: undefined,
      clusterInfo: undefined,
      profileSummary: undefined,
    };

    getResourceViewModelMock.mockResolvedValue(genericResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: String(genericResource.id) }),
    });

    const { container } = render(element);
    const topologySurface = container.querySelector("[data-resource-topology-surface]");
    const profileSurface = container.querySelector("[data-resource-profile-surface]");

    expect(topologySurface).not.toBeNull();
    expect(topologySurface).toHaveAttribute("data-resource-topology-surface", "prominent");
    expect(profileSurface).not.toBeNull();
    expect(topologySurface?.compareDocumentPosition(profileSurface as Node)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
    expect(screen.getByText(`topology:${genericResource.id}`)).toBeInTheDocument();
    expect(screen.getByText("Replica")).toBeInTheDocument();
    expect(screen.getByText("MySQL 8.0")).toBeInTheDocument();
  });

  it("renders cluster member table with display names for database_cluster resources", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [
        {
          id: 10,
          name: "orders-primary",
          displayName: "Orders Primary",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          profileSummary: { hostname: "db-01.internal", port: 3306 },
          healthStatus: "healthy",
          lifecycleStatus: "running",
        },
        {
          id: 11,
          name: "orders-replica",
          displayName: "Orders Replica",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          profileSummary: { hostname: "db-02.internal", port: 3306 },
          healthStatus: "healthy",
          lifecycleStatus: "running",
        },
      ],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    render(element);

    const memberTable = screen.getByTestId("cluster-members-table");
    expect(memberTable).toBeInTheDocument();

    expect(screen.getByText("Orders Primary")).toBeInTheDocument();
    expect(screen.getByText("Orders Replica")).toBeInTheDocument();
  });

  it("renders merged instance facts panel for database instances with clusterInfo", async () => {
    const instanceResource: ResourceDetailViewModel = {
      ...resource,
      id: 22,
      resourceType: "database_instance",
      profileSummary: {
        hostname: "prod-db-host-01.internal",
        port: 3306,
        engine: "mysql",
        version: "8.0.36",
        role: "primary",
      },
      clusterInfo: {
        id: 1,
        displayName: "Order MySQL Cluster Prod",
        healthStatus: "healthy",
        lifecycleStatus: "running",
      },
    };

    getResourceViewModelMock.mockResolvedValue(instanceResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "22" }),
    });

    render(element);

    const factsPanel = screen.getByTestId("database-instance-facts-panel");
    expect(factsPanel).toBeInTheDocument();
    expect(factsPanel).toHaveAttribute("data-consistency-status", "ok");

    expect(screen.queryByRole("heading", { name: "pages.resourceDetail.parentCluster.title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "pages.resourceDetail.connectionInfo.title" })).not.toBeInTheDocument();
  });

  it("renders operator summary for database clusters with profileSummary", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 1,
      resourceType: "database_cluster",
      profileSummary: {
        nodeCount: 3,
        engine: "mysql",
      },
      members: [],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "1" }),
    });

    render(element);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders database operator workbench for database_cluster resources", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    render(element);

    const workbench = screen.getByTestId("database-operator-workbench");
    expect(workbench).toBeInTheDocument();
    expect(workbench).toHaveAttribute("data-resource-type", "database_cluster");
    expect(screen.getByTestId("cluster-members-table")).toBeInTheDocument();
  });

  it("renders database operator workbench for database_instance resources", async () => {
    const instanceResource: ResourceDetailViewModel = {
      ...resource,
      id: 22,
      resourceType: "database_instance",
      clusterInfo: {
        id: 1,
        displayName: "Cluster",
        healthStatus: "healthy",
        lifecycleStatus: "running",
      },
    };

    getResourceViewModelMock.mockResolvedValue(instanceResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "22" }),
    });

    render(element);

    const workbench = screen.getByTestId("database-operator-workbench");
    expect(workbench).toBeInTheDocument();
    expect(workbench).toHaveAttribute("data-resource-type", "database_instance");
  });

  it("renders decision deck for database resources", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    render(element);

    const deck = screen.getByTestId("database-decision-deck");
    expect(deck).toBeInTheDocument();
    expect(deck).toHaveAttribute("data-resource-type", "database_cluster");
  });

  it("places database topology after the decision deck and cluster members", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [
        {
          id: 22,
          name: "orders-primary",
          displayName: "Orders Primary",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          profileSummary: { role: "primary", hostname: "db-01.internal", port: 3306 },
          healthStatus: "healthy",
          lifecycleStatus: "running",
        },
      ],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    const { container } = render(element);
    const deck = screen.getByTestId("database-decision-deck");
    const membersTable = screen.getByTestId("cluster-members-table");
    const topologySurface = container.querySelector("[data-resource-topology-surface]");
    const workbench = screen.getByTestId("database-operator-workbench");

    expect(membersTable).toBeInTheDocument();
    expect(topologySurface).not.toBeNull();
    // Decision deck → cluster members → topology → workbench
    expect(deck.compareDocumentPosition(membersTable)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(membersTable.compareDocumentPosition(topologySurface as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect((topologySurface as Node).compareDocumentPosition(workbench)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("renders consistency panel with cluster scope for database cluster resources", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [
        {
          id: 22,
          name: "orders-primary",
          displayName: "Orders Primary",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          profileSummary: { role: "primary", hostname: "db-01.internal", port: 3306 },
          healthStatus: "healthy",
          lifecycleStatus: "running",
        },
      ],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    render(element);

    const consistencyPanel = screen.getByTestId("database-consistency-panel");
    expect(consistencyPanel).toBeInTheDocument();
    expect(consistencyPanel).toHaveAttribute("data-consistency-status", "ok");
    expect(consistencyPanel).toHaveAttribute("data-consistency-scope", "cluster");
  });

  it("renders instance context and consistency panels with instance scope", async () => {
    const instanceResource: ResourceDetailViewModel = {
      ...resource,
      id: 22,
      resourceType: "database_instance",
      profileSummary: {
        hostname: "prod-db-host-01.internal",
        port: 3306,
        engine: "mysql",
        role: "primary",
      },
      clusterInfo: {
        id: 1,
        displayName: "Order MySQL Cluster Prod",
        healthStatus: "healthy",
        lifecycleStatus: "running",
      },
    };

    getResourceViewModelMock.mockResolvedValue(instanceResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "22" }),
    });

    render(element);

    expect(screen.getByTestId("database-instance-facts-panel")).toBeInTheDocument();
    const factsPanel = screen.getByTestId("database-instance-facts-panel");
    expect(factsPanel).toHaveAttribute("data-consistency-status", "ok");
  });

  it("does not render duplicate parent cluster and connection headings for database instances", async () => {
    const instanceResource: ResourceDetailViewModel = {
      ...resource,
      id: 22,
      resourceType: "database_instance",
      profileSummary: {
        hostname: "prod-db-host-01.internal",
        port: 3306,
        engine: "mysql",
        role: "primary",
      },
      clusterInfo: {
        id: 1,
        displayName: "Order MySQL Cluster Prod",
        healthStatus: "healthy",
        lifecycleStatus: "running",
      },
    };

    getResourceViewModelMock.mockResolvedValue(instanceResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "22" }),
    });

    render(element);

    expect(screen.getByTestId("database-instance-facts-panel")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "pages.resourceDetail.parentCluster.title" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "pages.resourceDetail.connectionInfo.title" })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 members/)).not.toBeInTheDocument();
  });

  it("renders supporting details section for database instance pages", async () => {
    const instanceResource: ResourceDetailViewModel = {
      ...resource,
      id: 22,
      resourceType: "database_instance",
      profileSummary: {
        hostname: "prod-db-host-01.internal",
        port: 3306,
      },
      clusterInfo: {
        id: 1,
        displayName: "Cluster",
        healthStatus: "healthy",
        lifecycleStatus: "running",
      },
    };

    getResourceViewModelMock.mockResolvedValue(instanceResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "22" }),
    });

    render(element);

    expect(screen.getByTestId("database-supporting-details")).toBeInTheDocument();
  });

  it("renders supporting details section for database cluster pages", async () => {
    const clusterResource: ResourceDetailViewModel = {
      ...resource,
      id: 14,
      resourceType: "database_cluster",
      members: [],
    };

    getResourceViewModelMock.mockResolvedValue(clusterResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "14" }),
    });

    render(element);

    expect(screen.getByTestId("database-supporting-details")).toBeInTheDocument();
  });

  it("does not render supporting details for non-database resources", async () => {
    const hostResource: ResourceDetailViewModel = {
      ...resource,
      id: 5,
      resourceType: "host",
      resourceSubtype: "linux",
    };

    getResourceViewModelMock.mockResolvedValue(hostResource);

    const { default: ResourceDetailPage } = await import("@/app/(console)/resources/[id]/page");

    const element = await ResourceDetailPage({
      params: Promise.resolve({ id: "5" }),
    });

    render(element);

    expect(screen.queryByTestId("database-supporting-details")).not.toBeInTheDocument();
  });
});
