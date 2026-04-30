import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ResourceDetailViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

function t(key: string, params?: Record<string, number>) {
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
    "evidence.title": "Diagnostic evidence",
    "evidence.description": "Facts used to explain the current operator verdict.",
    "evidence.source": "Source",
    "evidence.rawHint": "Field",
    "evidence.empty": "No abnormal diagnostic evidence is available.",
    "evidence.resourceHealthCritical": "Resource health is critical.",
    "evidence.resourceHealthWarning": "Resource health is warning.",
    "evidence.resourceHealthUnknown": "Resource health is unknown.",
    "evidence.memberHealthAbnormal": "Members with warning or critical health: 1.",
    "evidence.memberLifecycleAbnormal": "Members stopped or degraded: 1.",
    "evidence.memberRoleMissing": "Members missing role information: 1.",
    "evidence.memberConnectionMissing": "Members missing connection information: 1.",
    "evidence.auditNearbyChanges": "Recent resource or relation changes near this diagnostic context: 1.",
    "evidence.sources.resourceStatus": "Resource status",
    "evidence.sources.memberHealth": "Member health",
    "evidence.sources.memberLifecycle": "Member lifecycle",
    "evidence.sources.memberProfile": "Member profile",
    "evidence.sources.auditEvents": "Audit events",
    "runbook.title": "Next checks",
    "runbook.description": "Read-only investigation steps based on available data.",
    "runbook.checks.criticalHealth": "Check instance process status, connection details, and recent resource changes.",
    "runbook.checks.unknownHealth": "Check whether backend health signals are reporting correctly before treating this resource as healthy.",
    "runbook.checks.lifecycleState": "Confirm whether stopped or degraded state is expected maintenance or a recent change.",
    "runbook.checks.profileSync": "Check whether backend profile sync is providing role, host, and port data.",
    "runbook.checks.nearbyAudits": "Compare recent resource or relation changes with the time of the current signal.",
    "runbook.checks.noFindings": "No clear abnormal signal is available. Continue with topology and audit history.",
    "auditBuckets.title": "Audit context",
    "auditBuckets.summary": "Recent 3 audit events: 1 resource changes, 1 relation changes, 1 other events.",
    "auditBuckets.noEvents": "No recent audit events.",
    "auditBuckets.causalityNotice": "These events are nearby changes only; they do not confirm root cause.",
  };
  let result = keys[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, String(v));
    }
  }
  return result;
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
  "evidence.title", "evidence.description", "evidence.source", "evidence.rawHint",
  "evidence.empty", "evidence.resourceHealthCritical", "evidence.resourceHealthWarning",
  "evidence.resourceHealthUnknown", "evidence.memberHealthAbnormal",
  "evidence.memberLifecycleAbnormal", "evidence.memberRoleMissing",
  "evidence.memberConnectionMissing", "evidence.auditNearbyChanges",
  "evidence.sources.resourceStatus", "evidence.sources.memberHealth",
  "evidence.sources.memberLifecycle", "evidence.sources.memberProfile",
  "evidence.sources.auditEvents",
  "runbook.title", "runbook.description",
  "runbook.checks.criticalHealth", "runbook.checks.unknownHealth", "runbook.checks.lifecycleState",
  "runbook.checks.profileSync", "runbook.checks.nearbyAudits",
  "runbook.checks.noFindings",
  "auditBuckets.title", "auditBuckets.summary", "auditBuckets.noEvents",
  "auditBuckets.causalityNotice",
]);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(t as any).has = (key: string) => validKeys.has(key);

const diagnosticsKeys: Record<string, string> = {
  "audit.none": "No recent audit events.",
  "audit.recentEvents": "There are 1 recent audit events.",
  "audit.resourceChanges": "Recent resource status or relation changes.",
  "audit.viewAll": "View all audits",
};

const td = (key: string) => diagnosticsKeys[key] ?? key;
(td as unknown as { has: (k: string) => boolean }).has = (key: string) => key in diagnosticsKeys;

vi.mock("next-intl", () => ({
  useTranslations: (ns?: string) => (ns === "diagnostics" ? td : t),
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
  it("renders workbench evidence and runbook for healthy cluster", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={healthyClusterResource.members!}
      />,
    );

    expect(screen.getByText("Diagnostic evidence")).toBeInTheDocument();
    expect(screen.getByText("Next checks")).toBeInTheDocument();
    expect(screen.getByText("Member summary")).toBeInTheDocument();
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

  it("renders instance workbench evidence and audit without member summary", async () => {
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

    expect(screen.getByText("Diagnostic evidence")).toBeInTheDocument();
    expect(screen.queryByText("Member summary")).not.toBeInTheDocument();
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

    expect(screen.getByText("Audit context")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders audit context summary and view-all link", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "resource.updated",
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

    expect(screen.getByText("View all audits")).toBeInTheDocument();
  });

  it("renders count-based audit context for non-resource events", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "access.login",
          result: "success",
          createdAt: "2026-04-28T12:00:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Login completed.",
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

    expect(screen.getByText("admin")).toBeInTheDocument();
  });

  it("renders empty audit context when no audits", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={healthyClusterResource.members!}
        recentAudits={[]}
      />,
    );

    expect(screen.getByText("No recent audit events.")).toBeInTheDocument();
  });

  it("renders needs_attention evidence for cluster with warning members", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={warningClusterMembers}
      />,
    );

    expect(screen.getByText("Members with warning or critical health: 1.")).toBeInTheDocument();
    expect(screen.getByText("Member health")).toBeInTheDocument();
  });

  it("renders diagnostic evidence with source and raw field hint", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    const criticalResource: ResourceDetailViewModel = {
      ...healthyClusterResource,
      healthStatus: "critical",
    };

    render(
      <DatabaseOperatorWorkbench
        resource={criticalResource}
        members={[...warningClusterMembers]}
      />,
    );

    expect(screen.getByText("Diagnostic evidence")).toBeInTheDocument();
    expect(screen.getByText("Member health")).toBeInTheDocument();
    expect(screen.getByText(/members\[\]\.healthStatus/)).toBeInTheDocument();
  });

  it("renders next checks from evidence", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    const criticalResource: ResourceDetailViewModel = {
      ...healthyClusterResource,
      healthStatus: "critical",
    };

    render(
      <DatabaseOperatorWorkbench
        resource={criticalResource}
        members={[]}
      />,
    );

    expect(screen.getByText("Next checks")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check instance process status, connection details, and recent resource changes.",
      ),
    ).toBeInTheDocument();
  });

  it("renders no-findings runbook for healthy resource", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    render(
      <DatabaseOperatorWorkbench
        resource={healthyClusterResource}
        members={healthyClusterResource.members!}
      />,
    );

    expect(
      screen.getByText(
        "No clear abnormal signal is available. Continue with topology and audit history.",
      ),
    ).toBeInTheDocument();
  });

  it("renders unknown health runbook instead of no-findings for unknown resource health", async () => {
    const { DatabaseOperatorWorkbench } = await import(
      "@/components/resources/database-operator-workbench"
    );

    const unknownResource: ResourceDetailViewModel = {
      ...healthyClusterResource,
      healthStatus: "unknown",
      members: [],
    };

    render(
      <DatabaseOperatorWorkbench
        resource={unknownResource}
        members={[]}
        recentAudits={[]}
      />,
    );

    expect(
      screen.getByText(
        "Check whether backend health signals are reporting correctly before treating this resource as healthy.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "No clear abnormal signal is available. Continue with topology and audit history.",
      ),
    ).not.toBeInTheDocument();
  });

  it("renders grouped audit bucket summary", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-28T12:00:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Update completed.",
        },
        {
          id: 2,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "relation.created",
          result: "success",
          createdAt: "2026-04-28T12:01:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Relation created.",
        },
        {
          id: 3,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "auth.login",
          result: "success",
          createdAt: "2026-04-28T12:02:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Login.",
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

    expect(screen.getByText("Audit context")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Recent 3 audit events: 1 resource changes, 1 relation changes, 1 other events.",
      ),
    ).toBeInTheDocument();
  });

  it("renders cautious causality notice for resource or relation audit changes", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "resource.updated",
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

    expect(
      screen.getByText(
        "These events are nearby changes only; they do not confirm root cause.",
      ),
    ).toBeInTheDocument();
  });

  it("does not render causality notice when audits are only other events", async () => {
    const resourceWithAudits: ResourceDetailViewModel = {
      ...healthyClusterResource,
      recentAudits: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: 14,
          eventType: "auth.login",
          result: "success",
          createdAt: "2026-04-28T12:00:00Z",
          actorLabel: "admin",
          targetResourceName: "Orders Cluster",
          environmentLabel: "Production",
          summary: "Login.",
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

    expect(
      screen.queryByText(
        "These events are nearby changes only; they do not confirm root cause.",
      ),
    ).not.toBeInTheDocument();
  });
});
