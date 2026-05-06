import type { ResourceListViewModel } from "@/types/view-models";

export type DatabaseOperationalSignalLevel =
  | "healthy"
  | "needs_attention"
  | "critical"
  | "unknown";

export type DatabaseSignalFilter = "all" | "needs_attention" | "healthy" | "unknown";
export type DatabaseSignalSort = "abnormal_first" | "name" | "updated";

export type DatabaseSignalCounts = {
  all: number;
  needs_attention: number;
  healthy: number;
  unknown: number;
};

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

export function buildDatabaseSignalRank(row: ResourceListViewModel): number {
  const signal = buildDatabaseOperationalSignal(row);
  if (signal.reason === "instance_resource_critical") return 10;
  if (signal.level === "critical") return 15;
  if (signal.reason === "cluster_member_critical") return 20;
  if (signal.reason === "instance_resource_warning") return 30;
  if (signal.reason === "cluster_member_warning") return 40;
  if (
    signal.reason === "instance_lifecycle_stopped" ||
    signal.reason === "instance_lifecycle_degraded" ||
    signal.reason === "cluster_member_lifecycle"
  ) return 50;
  if (signal.level === "unknown") return 70;
  return 100;
}

export function databaseRowMatchesSignal(
  row: ResourceListViewModel,
  filter: DatabaseSignalFilter,
): boolean {
  if (filter === "all") return true;
  const signal = buildDatabaseOperationalSignal(row);
  if (filter === "needs_attention") {
    return signal.level === "needs_attention" || signal.level === "critical";
  }
  if (filter === "healthy") return signal.level === "healthy";
  return signal.level === "unknown";
}

export function sortDatabaseRowsBySignal(
  rows: ResourceListViewModel[],
  sort: DatabaseSignalSort,
): ResourceListViewModel[] {
  if (sort === "name") {
    return [...rows].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }
  if (sort === "updated") {
    return [...rows].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }
  return [...rows].sort((a, b) => {
    const rankDiff = buildDatabaseSignalRank(a) - buildDatabaseSignalRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.displayName.localeCompare(b.displayName);
  });
}

export function countDatabaseSignals(
  rows: ResourceListViewModel[],
): DatabaseSignalCounts {
  let needs_attention = 0;
  let healthy = 0;
  let unknown = 0;
  for (const row of rows) {
    const signal = buildDatabaseOperationalSignal(row);
    if (signal.level === "needs_attention" || signal.level === "critical") {
      needs_attention++;
    } else if (signal.level === "healthy") {
      healthy++;
    } else {
      unknown++;
    }
  }
  return { all: rows.length, needs_attention, healthy, unknown };
}
