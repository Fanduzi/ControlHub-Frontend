import type { ResourceListViewModel } from "@/types/view-models";

export type DatabaseOperationalSignalLevel =
  | "healthy"
  | "needs_attention"
  | "critical"
  | "unknown";

export type DatabaseOperationalSignalReason =
  | "resource_status"
  | "critical_member"
  | "warning_member"
  | "member_lifecycle"
  | "no_abnormal_members"
  | "unknown";

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
  if (row.healthStatus === "critical") {
    return { level: "critical", reason: "resource_status" };
  }

  if (
    row.healthStatus === "warning" ||
    row.lifecycleStatus === "stopped" ||
    row.lifecycleStatus === "degraded"
  ) {
    return { level: "needs_attention", reason: "resource_status" };
  }

  const summary = row.databaseOperationalSummary;

  if (summary?.criticalMemberCount && summary.criticalMemberCount > 0) {
    return {
      level: "needs_attention",
      reason: "critical_member",
      memberSignal: "critical",
      memberCount: summary.criticalMemberCount,
      worstMemberName: summary.worstMemberName,
    };
  }

  if (summary?.warningMemberCount && summary.warningMemberCount > 0) {
    return {
      level: "needs_attention",
      reason: "warning_member",
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
      reason: "member_lifecycle",
      memberSignal: "lifecycle",
      memberCount: lifecycleCount,
      worstMemberName: summary?.worstMemberName,
    };
  }

  if (summary) {
    return { level: "healthy", reason: "no_abnormal_members" };
  }

  return { level: "unknown", reason: "unknown" };
}
