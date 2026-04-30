import type { ClusterMember } from "@/types/resource";
import type { AuditEventViewModel, ResourceDetailViewModel } from "@/types/view-models";

export type DiagnosticEvidenceSeverity = "critical" | "warning" | "info" | "unknown";

export type DiagnosticEvidence = {
  id: string;
  severity: DiagnosticEvidenceSeverity;
  titleKey: string;
  sourceKey: string;
  rawHint: string;
  count: number;
};

export type RunbookCheck = {
  id: string;
  textKey: string;
};

export type AuditBuckets = {
  total: number;
  resourceChanges: number;
  relationChanges: number;
  otherEvents: number;
  hasPotentiallyRelevantChanges: boolean;
};

function hasAbnormalHealth(status: string): boolean {
  return status === "critical" || status === "warning";
}

function hasAbnormalLifecycle(status: string): boolean {
  return status === "stopped" || status === "degraded";
}

function countMembers(
  members: ClusterMember[],
  predicate: (m: ClusterMember) => boolean,
): number {
  return members.filter(predicate).length;
}

export function buildDiagnosticEvidence({
  resource,
  members,
  recentAudits,
}: {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  recentAudits: AuditEventViewModel[];
}): DiagnosticEvidence[] {
  const evidence: DiagnosticEvidence[] = [];

  if (resource.healthStatus === "critical") {
    evidence.push({
      id: "resource-health-critical",
      severity: "critical",
      titleKey: "databaseOperator.evidence.resourceHealthCritical",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=critical",
      count: 1,
    });
  } else if (resource.healthStatus === "warning") {
    evidence.push({
      id: "resource-health-warning",
      severity: "warning",
      titleKey: "databaseOperator.evidence.resourceHealthWarning",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=warning",
      count: 1,
    });
  } else if (resource.healthStatus === "unknown") {
    evidence.push({
      id: "resource-health-unknown",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.resourceHealthUnknown",
      sourceKey: "databaseOperator.evidence.sources.resourceStatus",
      rawHint: "healthStatus=unknown",
      count: 1,
    });
  }

  const abnormalHealthCount = countMembers(members, (m) =>
    hasAbnormalHealth(m.healthStatus),
  );
  if (abnormalHealthCount > 0) {
    evidence.push({
      id: "member-health-abnormal",
      severity: members.some((m) => m.healthStatus === "critical")
        ? "critical"
        : "warning",
      titleKey: "databaseOperator.evidence.memberHealthAbnormal",
      sourceKey: "databaseOperator.evidence.sources.memberHealth",
      rawHint: "members[].healthStatus",
      count: abnormalHealthCount,
    });
  }

  const abnormalLifecycleCount = countMembers(members, (m) =>
    hasAbnormalLifecycle(m.lifecycleStatus),
  );
  if (abnormalLifecycleCount > 0) {
    evidence.push({
      id: "member-lifecycle-abnormal",
      severity: "warning",
      titleKey: "databaseOperator.evidence.memberLifecycleAbnormal",
      sourceKey: "databaseOperator.evidence.sources.memberLifecycle",
      rawHint: "members[].lifecycleStatus",
      count: abnormalLifecycleCount,
    });
  }

  const missingRoleCount = countMembers(
    members,
    (m) => !m.profileSummary?.role,
  );
  if (missingRoleCount > 0) {
    evidence.push({
      id: "member-role-missing",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.memberRoleMissing",
      sourceKey: "databaseOperator.evidence.sources.memberProfile",
      rawHint: "profileSummary.role",
      count: missingRoleCount,
    });
  }

  const missingConnectionCount = countMembers(
    members,
    (m) => !m.profileSummary?.hostname || !m.profileSummary?.port,
  );
  if (missingConnectionCount > 0) {
    evidence.push({
      id: "member-connection-missing",
      severity: "unknown",
      titleKey: "databaseOperator.evidence.memberConnectionMissing",
      sourceKey: "databaseOperator.evidence.sources.memberProfile",
      rawHint: "profileSummary.hostname|profileSummary.port",
      count: missingConnectionCount,
    });
  }

  const auditBuckets = buildAuditBuckets(recentAudits);
  if (auditBuckets.hasPotentiallyRelevantChanges) {
    evidence.push({
      id: "audit-nearby-changes",
      severity: "info",
      titleKey: "databaseOperator.evidence.auditNearbyChanges",
      sourceKey: "databaseOperator.evidence.sources.auditEvents",
      rawHint: "recentAudits[].eventType",
      count: auditBuckets.resourceChanges + auditBuckets.relationChanges,
    });
  }

  return evidence;
}

export function buildRunbookChecks(evidence: DiagnosticEvidence[]): RunbookCheck[] {
  const ids = new Set(evidence.map((item) => item.id));
  const checks: RunbookCheck[] = [];

  if (
    ids.has("resource-health-critical") ||
    ids.has("resource-health-warning") ||
    ids.has("member-health-abnormal")
  ) {
    checks.push({
      id: "check-critical-health",
      textKey: "databaseOperator.runbook.checks.criticalHealth",
    });
  }

  if (ids.has("resource-health-unknown")) {
    checks.push({
      id: "check-unknown-health",
      textKey: "databaseOperator.runbook.checks.unknownHealth",
    });
  }

  if (ids.has("member-lifecycle-abnormal")) {
    checks.push({
      id: "check-lifecycle-state",
      textKey: "databaseOperator.runbook.checks.lifecycleState",
    });
  }

  if (ids.has("member-role-missing") || ids.has("member-connection-missing")) {
    checks.push({
      id: "check-profile-sync",
      textKey: "databaseOperator.runbook.checks.profileSync",
    });
  }

  if (ids.has("audit-nearby-changes")) {
    checks.push({
      id: "check-nearby-audits",
      textKey: "databaseOperator.runbook.checks.nearbyAudits",
    });
  }

  if (checks.length === 0) {
    checks.push({
      id: "check-no-findings",
      textKey: "databaseOperator.runbook.checks.noFindings",
    });
  }

  return checks;
}

export function buildAuditBuckets(audits: AuditEventViewModel[]): AuditBuckets {
  let resourceChanges = 0;
  let relationChanges = 0;
  let otherEvents = 0;

  for (const event of audits) {
    if (event.eventType.startsWith("resource.")) {
      resourceChanges += 1;
    } else if (event.eventType.startsWith("relation.")) {
      relationChanges += 1;
    } else {
      otherEvents += 1;
    }
  }

  return {
    total: audits.length,
    resourceChanges,
    relationChanges,
    otherEvents,
    hasPotentiallyRelevantChanges: resourceChanges + relationChanges > 0,
  };
}
