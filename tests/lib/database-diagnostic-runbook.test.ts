import { describe, expect, it } from "vitest";

import {
  buildAuditBuckets,
  buildDiagnosticEvidence,
  buildRunbookChecks,
} from "@/lib/database-diagnostic-runbook";
import type { ClusterMember } from "@/types/resource";
import type { AuditEventViewModel, ResourceDetailViewModel } from "@/types/view-models";

function resource(
  overrides: Partial<ResourceDetailViewModel> = {},
): ResourceDetailViewModel {
  return {
    id: 14,
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    name: "payment-mysql-cluster-prod",
    displayName: "Payment MySQL Cluster Production",
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "seed",
    externalId: "dbaas-payment-mysql-cluster-prod",
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
    members: [],
    ...overrides,
  };
}

function member(overrides: Partial<ClusterMember> = {}): ClusterMember {
  return {
    id: 22,
    name: "payment-mysql-primary-prod",
    displayName: "Payment MySQL Primary Production",
    resourceType: "database_instance",
    resourceSubtype: "mysql",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    profileSummary: {
      role: "primary",
      hostname: "prod-db-host-02.internal",
      port: 3307,
    },
    ...overrides,
  };
}

function audit(eventType: string): AuditEventViewModel {
  return {
    id: Math.floor(Math.random() * 100000),
    actorUserId: 1,
    targetResourceId: 14,
    eventType,
    result: "success",
    createdAt: "2026-04-30T10:00:00Z",
    actorLabel: "admin",
    targetResourceName: "Payment MySQL Cluster Production",
    environmentLabel: "Production",
    summary: eventType,
  };
}

describe("buildDiagnosticEvidence", () => {
  it("emits critical resource health evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource({ healthStatus: "critical" }),
      members: [],
      recentAudits: [],
    });

    expect(evidence).toContainEqual({
      id: "resource-health-critical",
      severity: "critical",
      titleKey: "databaseOperator.evidence.resourceHealthCritical",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=critical",
      count: 1,
    });
  });

  it("emits member health and lifecycle evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [
        member({ healthStatus: "warning" }),
        member({ lifecycleStatus: "stopped" }),
      ],
      recentAudits: [],
    });

    expect(evidence.map((item) => item.id)).toContain("member-health-abnormal");
    expect(evidence.map((item) => item.id)).toContain("member-lifecycle-abnormal");
  });

  it("emits missing role evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [member({ profileSummary: {} })],
      recentAudits: [],
    });

    expect(evidence).toContainEqual({
      id: "member-role-missing",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.memberRoleMissing",
      sourceKey: "databaseOperator.evidence.sources.memberProfile",
      rawHint: "profileSummary.role",
      count: 1,
    });
  });

  it("emits no abnormal evidence for healthy complete data", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [member()],
      recentAudits: [],
    });

    expect(evidence).toEqual([]);
  });

  it("emits warning resource health evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource({ healthStatus: "warning" }),
      members: [],
      recentAudits: [],
    });

    expect(evidence).toContainEqual({
      id: "resource-health-warning",
      severity: "warning",
      titleKey: "databaseOperator.evidence.resourceHealthWarning",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=warning",
      count: 1,
    });
  });

  it("emits unknown resource health evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource({ healthStatus: "unknown" }),
      members: [],
      recentAudits: [],
    });

    expect(evidence).toContainEqual({
      id: "resource-health-unknown",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.resourceHealthUnknown",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=unknown",
      count: 1,
    });
  });

  it("emits missing connection evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [member({ profileSummary: { role: "primary" } })],
      recentAudits: [],
    });

    expect(evidence).toContainEqual({
      id: "member-connection-missing",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.memberConnectionMissing",
      sourceKey: "databaseOperator.evidence.sources.memberProfile",
      rawHint: "profileSummary.hostname|profileSummary.port",
      count: 1,
    });
  });

  it("emits audit nearby changes evidence", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [member()],
      recentAudits: [
        audit("resource.updated"),
        audit("relation.created"),
      ],
    });

    expect(evidence).toContainEqual({
      id: "audit-nearby-changes",
      severity: "info",
      titleKey: "databaseOperator.evidence.auditNearbyChanges",
      sourceKey: "databaseOperator.evidence.sources.auditEvents",
      rawHint: "recentAudits[].eventType",
      count: 2,
    });
  });

  it("does not emit audit evidence when only other events exist", () => {
    const evidence = buildDiagnosticEvidence({
      resource: resource(),
      members: [member()],
      recentAudits: [audit("access.login")],
    });

    expect(evidence).toEqual([]);
  });
});

describe("buildRunbookChecks", () => {
  it("suggests critical health checks for critical resources", () => {
    const checks = buildRunbookChecks(
      buildDiagnosticEvidence({
        resource: resource({ healthStatus: "critical" }),
        members: [],
        recentAudits: [],
      }),
    );

    expect(checks).toContainEqual({
      id: "check-critical-health",
      textKey: "databaseOperator.runbook.checks.criticalHealth",
    });
  });

  it("suggests profile sync check for missing role evidence", () => {
    const checks = buildRunbookChecks([
      {
        id: "member-role-missing",
        severity: "unknown",
        titleKey: "databaseOperator.evidence.memberRoleMissing",
        sourceKey: "databaseOperator.evidence.sources.memberProfile",
        rawHint: "profileSummary.role",
        count: 2,
      },
    ]);

    expect(checks).toContainEqual({
      id: "check-profile-sync",
      textKey: "databaseOperator.runbook.checks.profileSync",
    });
  });

  it("returns a no-findings check when no evidence exists", () => {
    expect(buildRunbookChecks([])).toEqual([
      {
        id: "check-no-findings",
        textKey: "databaseOperator.runbook.checks.noFindings",
      },
    ]);
  });

  it("suggests lifecycle check for stopped members", () => {
    const checks = buildRunbookChecks([
      {
        id: "member-lifecycle-abnormal",
        severity: "warning",
        titleKey: "databaseOperator.evidence.memberLifecycleAbnormal",
        sourceKey: "databaseOperator.evidence.sources.memberLifecycle",
        rawHint: "members[].lifecycleStatus",
        count: 1,
      },
    ]);

    expect(checks).toContainEqual({
      id: "check-lifecycle-state",
      textKey: "databaseOperator.runbook.checks.lifecycleState",
    });
  });

  it("suggests nearby audits check when audit changes exist", () => {
    const checks = buildRunbookChecks([
      {
        id: "audit-nearby-changes",
        severity: "info",
        titleKey: "databaseOperator.evidence.auditNearbyChanges",
        sourceKey: "databaseOperator.evidence.sources.auditEvents",
        rawHint: "recentAudits[].eventType",
        count: 2,
      },
    ]);

    expect(checks).toContainEqual({
      id: "check-nearby-audits",
      textKey: "databaseOperator.runbook.checks.nearbyAudits",
    });
  });
});

describe("buildAuditBuckets", () => {
  it("groups resource, relation, and other audit events", () => {
    const buckets = buildAuditBuckets([
      audit("resource.updated"),
      audit("relation.created"),
      audit("auth.login"),
    ]);

    expect(buckets).toEqual({
      total: 3,
      resourceChanges: 1,
      relationChanges: 1,
      otherEvents: 1,
      hasPotentiallyRelevantChanges: true,
    });
  });

  it("returns zero buckets for no audits", () => {
    expect(buildAuditBuckets([])).toEqual({
      total: 0,
      resourceChanges: 0,
      relationChanges: 0,
      otherEvents: 0,
      hasPotentiallyRelevantChanges: false,
    });
  });

  it("counts multiple resource changes", () => {
    const buckets = buildAuditBuckets([
      audit("resource.updated"),
      audit("resource.created"),
      audit("resource.archived"),
    ]);

    expect(buckets).toEqual({
      total: 3,
      resourceChanges: 3,
      relationChanges: 0,
      otherEvents: 0,
      hasPotentiallyRelevantChanges: true,
    });
  });

  it("detects no relevant changes for other-only events", () => {
    const buckets = buildAuditBuckets([
      audit("auth.login"),
      audit("access.view"),
    ]);

    expect(buckets.hasPotentiallyRelevantChanges).toBe(false);
  });
});
