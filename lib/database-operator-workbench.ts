import type { ResourceListViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

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
