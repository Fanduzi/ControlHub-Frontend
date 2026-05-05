import type { ResourceListViewModel } from "@/types/view-models";

export type DatabaseOperationalSignalLevel =
  | "healthy"
  | "needs_attention"
  | "critical"
  | "unknown";

export type DatabaseOperationalSignalReason =
  | "instance_healthy"
  | "instance_resource_critical"
  | "instance_resource_warning"
  | "instance_lifecycle_stopped"
  | "instance_lifecycle_degraded"
  | "instance_status_unknown"
  | "cluster_member_critical"
  | "cluster_member_warning"
  | "cluster_member_lifecycle"
  | "cluster_healthy"
  | "cluster_summary_unavailable";

export type DatabaseOperationalSignal = {
  level: DatabaseOperationalSignalLevel;
  reason: DatabaseOperationalSignalReason;
  memberSignal?: "critical" | "warning" | "lifecycle";
  memberCount?: number;
  worstMemberName?: string;
};

export function buildDatabaseOperationalSignal(
  row: ResourceListViewModel,
): DatabaseOperationalSignal {
  if (row.resourceType === "database_instance") {
    return buildInstanceSignal(row);
  }
  return buildClusterSignal(row);
}

function buildInstanceSignal(
  row: ResourceListViewModel,
): DatabaseOperationalSignal {
  if (row.healthStatus === "critical") {
    return { level: "needs_attention", reason: "instance_resource_critical" };
  }

  if (row.healthStatus === "warning") {
    return { level: "needs_attention", reason: "instance_resource_warning" };
  }

  if (row.lifecycleStatus === "stopped") {
    return { level: "needs_attention", reason: "instance_lifecycle_stopped" };
  }

  if (row.lifecycleStatus === "degraded") {
    return { level: "needs_attention", reason: "instance_lifecycle_degraded" };
  }

  if (row.healthStatus === "healthy" && row.lifecycleStatus === "running") {
    return { level: "healthy", reason: "instance_healthy" };
  }

  return { level: "unknown", reason: "instance_status_unknown" };
}

function buildClusterSignal(
  row: ResourceListViewModel,
): DatabaseOperationalSignal {
  if (row.healthStatus === "critical") {
    return { level: "critical", reason: "instance_resource_critical" };
  }

  if (row.healthStatus === "warning") {
    return { level: "needs_attention", reason: "instance_resource_warning" };
  }

  if (
    row.lifecycleStatus === "stopped" ||
    row.lifecycleStatus === "degraded"
  ) {
    return { level: "needs_attention", reason: "instance_resource_warning" };
  }

  const summary = row.databaseOperationalSummary;

  if (summary?.criticalMemberCount && summary.criticalMemberCount > 0) {
    return {
      level: "needs_attention",
      reason: "cluster_member_critical",
      memberSignal: "critical",
      memberCount: summary.criticalMemberCount,
      worstMemberName: summary.worstMemberName,
    };
  }

  if (summary?.warningMemberCount && summary.warningMemberCount > 0) {
    return {
      level: "needs_attention",
      reason: "cluster_member_warning",
      memberSignal: "warning",
      memberCount: summary.warningMemberCount,
      worstMemberName: summary.worstMemberName,
    };
  }

  const lifecycleCount =
    (summary?.stoppedMemberCount ?? 0) + (summary?.degradedMemberCount ?? 0);
  if (lifecycleCount > 0) {
    return {
      level: "needs_attention",
      reason: "cluster_member_lifecycle",
      memberSignal: "lifecycle",
      memberCount: lifecycleCount,
      worstMemberName: summary?.worstMemberName,
    };
  }

  if (summary) {
    return { level: "healthy", reason: "cluster_healthy" };
  }

  return { level: "unknown", reason: "cluster_summary_unavailable" };
}
