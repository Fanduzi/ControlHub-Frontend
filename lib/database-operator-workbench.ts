import type { ResourceListViewModel, ResourceDetailViewModel } from "@/types/view-models";
import type { AuditEventViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

import { buildDiagnosticEvidence } from "@/lib/database-diagnostic-runbook";

export type DecisionDeckMode = "compact_healthy" | "diagnostic";

export function buildDecisionDeckMode({
  resource,
  members,
  recentAudits,
}: {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  recentAudits?: AuditEventViewModel[];
}): DecisionDeckMode {
  if (
    resource.healthStatus === "critical" ||
    resource.healthStatus === "warning" ||
    resource.healthStatus === "unknown"
  ) {
    return "diagnostic";
  }

  if (
    resource.lifecycleStatus === "stopped" ||
    resource.lifecycleStatus === "degraded"
  ) {
    return "diagnostic";
  }

  const hasAbnormalMember = members.some(
    (m) =>
      m.healthStatus === "critical" ||
      m.healthStatus === "warning" ||
      m.healthStatus === "unknown" ||
      m.lifecycleStatus === "stopped" ||
      m.lifecycleStatus === "degraded",
  );
  if (hasAbnormalMember) {
    return "diagnostic";
  }

  const evidence = buildDiagnosticEvidence({
    resource,
    members,
    recentAudits: recentAudits ?? [],
  });
  const nonAuditEvidence = evidence.filter(
    (item) => item.id !== "audit-nearby-changes",
  );
  if (nonAuditEvidence.length > 0) {
    return "diagnostic";
  }

  return "compact_healthy";
}

export type OperatorVerdictLevel =
  | "healthy"
  | "needs_attention"
  | "critical"
  | "unknown";

export interface ClusterMemberSummary {
  total: number;
  primary: number;
  replica: number;
  roleUnknown: number;
  warningOrCritical: number;
  stoppedOrDegraded: number;
}

export interface DatabaseOperatorVerdict {
  level: OperatorVerdictLevel;
  facts: string[];
}

function normalizedRole(member: ClusterMember): string {
  return (member.profileSummary?.role ?? "").toLowerCase();
}

export function buildClusterMemberSummary(
  members: ClusterMember[],
): ClusterMemberSummary {
  let primary = 0;
  let replica = 0;
  let roleUnknown = 0;
  let warningOrCritical = 0;
  let stoppedOrDegraded = 0;

  for (const member of members) {
    const role = normalizedRole(member);
    if (
      role === "primary" ||
      role === "master" ||
      role === "writer"
    ) {
      primary += 1;
    } else if (
      role === "replica" ||
      role === "secondary" ||
      role === "reader"
    ) {
      replica += 1;
    } else {
      roleUnknown += 1;
    }

    if (
      member.healthStatus === "warning" ||
      member.healthStatus === "critical"
    ) {
      warningOrCritical += 1;
    }

    if (
      member.lifecycleStatus === "stopped" ||
      member.lifecycleStatus === "degraded"
    ) {
      stoppedOrDegraded += 1;
    }
  }

  return {
    total: members.length,
    primary,
    replica,
    roleUnknown,
    warningOrCritical,
    stoppedOrDegraded,
  };
}

export function buildDatabaseOperatorVerdict({
  resource,
  members,
}: {
  resource: ResourceListViewModel;
  members: ClusterMember[];
}): DatabaseOperatorVerdict {
  const facts: string[] = [];
  const summary = buildClusterMemberSummary(members);

  if (resource.healthStatus === "critical") {
    facts.push("resource_health_critical");
    return { level: "critical", facts };
  }

  if (summary.warningOrCritical > 0) {
    facts.push("members_warning_or_critical");
  }

  if (
    summary.stoppedOrDegraded > 0 ||
    resource.lifecycleStatus === "stopped" ||
    resource.lifecycleStatus === "degraded"
  ) {
    facts.push("lifecycle_needs_attention");
  }

  if (facts.length > 0) {
    return { level: "needs_attention", facts };
  }

  if (resource.healthStatus === "unknown") {
    facts.push("resource_health_unknown");
    return { level: "unknown", facts };
  }

  facts.push("all_known_members_healthy");
  return { level: "healthy", facts };
}

function healthPriority(status: string): number {
  if (status === "critical") return 0;
  if (status === "warning") return 1;
  if (status === "unknown") return 2;
  return 3;
}

function lifecyclePriority(status: string): number {
  if (status === "stopped") return 0;
  if (status === "degraded") return 1;
  if (status === "pending") return 2;
  return 3;
}

function rolePriority(role: string): number {
  const normalized = role.toLowerCase();
  if (["primary", "master", "writer"].includes(normalized)) return 0;
  if (["replica", "secondary", "reader"].includes(normalized)) return 1;
  return 2;
}

export function sortClusterMembersForOperations<T extends ClusterMember>(
  members: T[],
): T[] {
  return [...members].sort((left, right) => {
    return (
      healthPriority(left.healthStatus) - healthPriority(right.healthStatus) ||
      lifecyclePriority(left.lifecycleStatus) - lifecyclePriority(right.lifecycleStatus) ||
      rolePriority(left.profileSummary?.role ?? "") - rolePriority(right.profileSummary?.role ?? "") ||
      left.displayName.localeCompare(right.displayName)
    );
  });
}

export interface AuditContextSummary {
  count: number;
  summaryKey: string;
  hasResourceChange: boolean;
}

export function buildAuditContextSummary(
  audits: Array<{ eventType: string }>,
): AuditContextSummary {
  if (audits.length === 0) {
    return {
      count: 0,
      summaryKey: "audit.none",
      hasResourceChange: false,
    };
  }

  const hasResourceChange = audits.some(
    (event) =>
      event.eventType.startsWith("resource.") ||
      event.eventType.startsWith("relation."),
  );

  return {
    count: audits.length,
    summaryKey: hasResourceChange
      ? "audit.resourceChanges"
      : "audit.recentEvents",
    hasResourceChange,
  };
}
