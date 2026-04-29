import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResourceDetailViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

function t(key: string) {
  const keys: Record<string, string> = {
    "title": "Operator workbench",
    "description": "Health verdict and diagnostics.",
    "verdict.healthy": "Healthy",
    "verdict.needs_attention": "Needs attention",
    "verdict.critical": "Critical",
    "verdict.unknown": "Unknown",
    "facts.all_known_members_healthy": "All known members are healthy.",
    "facts.members_warning_or_critical": "Some members have warning or critical health.",
    "facts.resource_health_critical": "Resource health is critical.",
    "facts.lifecycle_needs_attention": "Some resources are stopped or degraded.",
    "facts.resource_health_unknown": "Resource health is unknown.",
    "memberSummary.title": "Member summary",
    "memberSummary.description": "Distribution of member roles and health.",
    "memberSummary.total": "Total",
    "memberSummary.primary": "Primary",
    "memberSummary.replica": "Replica",
    "memberSummary.roleUnknown": "Role unknown",
    "memberSummary.warningOrCritical": "Warning / critical",
    "memberSummary.stoppedOrDegraded": "Stopped / degraded",
    "recentAudits.title": "Recent audits",
    "recentAudits.description": "Last 5 audit events for this resource.",
    "topology.openExpanded": "Open expanded topology",
    "instanceContext.parentCluster": "Parent cluster",
    "instanceContext.parentClusterDescription": "The cluster this instance belongs to.",
    "instanceContext.connection": "Connection",
    "instanceContext.connectionDescription": "Network and engine details.",
    "instanceContext.hostname": "Hostname",
    "instanceContext.port": "Port",
    "instanceContext.engine": "Engine",
    "instanceContext.version": "Version",
    "instanceContext.role": "Role",
    "instanceContext.role_primary": "Primary",
    "instanceContext.role_replica": "Replica",
  };
  return keys[key] ?? key;
}
const validKeys = new Set([
  "title", "description", "verdict.healthy", "verdict.needs_attention",
  "verdict.critical", "verdict.unknown", "facts.all_known_members_healthy",
  "facts.members_warning_or_critical", "facts.resource_health_critical",
  "facts.lifecycle_needs_attention", "facts.resource_health_unknown",
  "memberSummary.title", "memberSummary.description", "memberSummary.total",
  "memberSummary.primary", "memberSummary.replica", "memberSummary.roleUnknown",
  "memberSummary.warningOrCritical", "memberSummary.stoppedOrDegraded",
  "recentAudits.title", "recentAudits.description", "topology.openExpanded",
  "instanceContext.parentCluster", "instanceContext.parentClusterDescription",
  "instanceContext.connection", "instanceContext.connectionDescription",
  "instanceContext.hostname", "instanceContext.port", "instanceContext.engine",
  "instanceContext.version", "instanceContext.role",
  "instanceContext.role_primary", "instanceContext.role_replica",
]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(t as any).has = (key: string) => validKeys.has(key);

vi.mock("next-intl", () => ({
  useTranslations: () => t,
}));

const healthyClusterResource: ResourceDetailViewModel = {
  id: 14,
  resourceType: "database_cluster",
  resourceSubtype: "mysql",
  name: "orders-cluster",
  displayName: "Orders Cluster",
  environmentId: 1,
  ownerId: 1,
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "",
  labels: {},
  createdAt: "",
  updatedAt: "",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  environmentName: "Production",
  ownerName: "DBA Team",
  summary: "",
  isArchived: false,
  profile: {},
  relations: [],
  auditEvents: [],
  recentAudits: [],
  members: [
    {
      id: 10,
      name: "orders-primary",
      displayName: "Orders Primary",
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      profileSummary: { role: "primary", hostname: "db-01", port: 3306 },
      healthStatus: "healthy",
      lifecycleStatus: "running",
    },
    {
      id: 11,
      name: "orders-replica",
      displayName: "Orders Replica",
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      profileSummary: { role: "replica", hostname: "db-02", port: 3306 },
      healthStatus: "healthy",
      lifecycleStatus: "running",
    },
  ],
};

const warningClusterMembers: ClusterMember[] = [
  {
    id: 10,
    name: "orders-primary",
    displayName: "Orders Primary",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    profileSummary: { role: "primary", hostname: "db-01", port: 3306 },
    healthStatus: "healthy",
    lifecycleStatus: "running",
  },
  {
    id: 11,
    name: "orders-replica",
    displayName: "Orders Replica",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    profileSummary: { role: "replica", hostname: "db-02", port: 3306 },
    healthStatus: "warning",
    lifecycleStatus: "running",
  },
];

const instanceResource: ResourceDetailViewModel = {
  id: 22,
  resourceType: "database_instance",
  resourceSubtype: "mysql",
  name: "orders-primary",
  displayName: "Orders Primary",
  environmentId: 1,
  ownerId: 1,
  lifecycleStatus: "running",
  healthStatus: "healthy",
  source: "manual",
  externalId: "",
  labels: {},
  createdAt: "",
  updatedAt: "",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
  environmentName: "Production",
  ownerName: "DBA Team",
  summary: "",
  isArchived: false,
  profile: {},
  relations: [],
  auditEvents: [],
  recentAudits: [],
  profileSummary: {
    hostname: "db-01.internal",
    port: 3306,
    engine: "mysql",
    version: "8.0.36",
    role: "primary",
  },
  clusterInfo: {
    id: 14,
    displayName: "Orders Cluster",
    healthStatus: "healthy",
    lifecycleStatus: "running",
  },
};

describe("DatabaseOperatorWorkbench", () => {
  it("renders verdict heading for healthy cluster", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={healthyClusterResource.members!}
      />,
    );

    expect(screen.getByText("Operator workbench")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("All known members are healthy.")).toBeInTheDocument();
  });

  it("renders cluster member summary cards", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={healthyClusterResource.members!}
      />,
    );

    expect(screen.getByText("Member summary")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.getByText("Replica")).toBeInTheDocument();
  });

  it("renders instance connection context with profile summary", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={instanceResource}
        members={[]}
        clusterInfo={instanceResource.clusterInfo}
      />,
    );

    expect(screen.getByText("db-01.internal")).toBeInTheDocument();
    expect(screen.getByText("3306")).toBeInTheDocument();
    expect(screen.getByText("mysql")).toBeInTheDocument();
    expect(screen.getByText("8.0.36")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
  });

  it("renders recent audits section", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "resource.update",
          result: "success",
          createdAt: "2026-04-28T12:00:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Update completed.",
        },
      ],
    };

    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={resourceWithAudits}
        members={resourceWithAudits.members!}
        recentAudits={resourceWithAudits.recentAudits}
      />,
    );

    expect(screen.getByText("Recent audits")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders needs_attention verdict for cluster with warning members", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={warningClusterMembers}
      />,
    );

    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Some members have warning or critical health.")).toBeInTheDocument();
  });
});
