"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { useEnvironment } from "@/components/providers/environment-provider";
import { formatLabel } from "@/lib/format";
import { buildDatabaseOperationalSignal } from "@/lib/database-operational-signal";
import { localizeResourceType } from "@/lib/resource-summary";
import { HEALTH_BORDER, HEALTH_METRIC_TEXT, POSTURE_BAR_COLORS } from "@/lib/severity-colors";
import type { ResourceListViewModel } from "@/types/view-models";

type OverviewContentProps = {
  resources: ResourceListViewModel[];
  attentionResources: ResourceListViewModel[];
};

type Metrics = {
  total: number;
  critical: number;
  warning: number;
  pending: number;
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  unknown: 2,
  healthy: 3,
};

function severityRank(resource: ResourceListViewModel): number {
  const healthRank = SEVERITY_ORDER[resource.healthStatus] ?? 99;
  const lifecycleBonus = resource.lifecycleStatus !== "running" ? 0 : 10;
  if (healthRank < 3) return healthRank * 100 + lifecycleBonus;

  if (
    resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance"
  ) {
    const signal = buildDatabaseOperationalSignal(resource);
    if (signal.level === "needs_attention" || signal.level === "critical") {
      return 150;
    }
  }

  return healthRank * 100 + lifecycleBonus;
}

function isActionableAttention(resource: ResourceListViewModel): boolean {
  const actionableHealth = ["critical", "warning"].includes(
    resource.healthStatus,
  );
  const actionableLifecycle = resource.lifecycleStatus !== "running";
  if (actionableHealth || actionableLifecycle) return true;

  if (
    resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance"
  ) {
    const signal = buildDatabaseOperationalSignal(resource);
    return signal.level === "needs_attention" || signal.level === "critical";
  }

  return false;
}

function computeMetrics(resources: ResourceListViewModel[]): Metrics {
  return {
    total: resources.length,
    critical: resources.filter(
      (r) => r.healthStatus === "critical",
    ).length,
    warning: resources.filter((r) => r.healthStatus === "warning").length,
    pending: resources.filter((r) => r.lifecycleStatus === "pending").length,
  };
}

function buildAttentionReason(
  resource: ResourceListViewModel,
  t: ReturnType<typeof useTranslations>,
): string {
  if (
    resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance"
  ) {
    const signal = buildDatabaseOperationalSignal(resource);
    if (signal.reason === "cluster_member_critical" && signal.memberCount != null) {
      return t("pages.overview.attention.databaseMemberSignal", {
        count: signal.memberCount,
        status: t("tables.databases.signalCritical"),
      });
    }
    if (signal.reason === "cluster_member_warning" && signal.memberCount != null) {
      return t("pages.overview.attention.databaseMemberSignal", {
        count: signal.memberCount,
        status: t("tables.databases.signalNeedsAttention"),
      });
    }
    if (signal.reason === "cluster_member_lifecycle" && signal.memberCount != null) {
      return t("pages.overview.attention.databaseMemberSignal", {
        count: signal.memberCount,
        status: t("pages.overview.attention.lifecycleAbnormal"),
      });
    }
  }

  const reasons: string[] = [];

  if (resource.healthStatus === "critical" || resource.healthStatus === "warning") {
    const fallbackKey = `diagnostics.reasons.healthStatus.${resource.healthStatus}`;
    reasons.push(t.has(fallbackKey) ? t(fallbackKey) : fallbackKey);
  }
  if (
    resource.lifecycleStatus !== "running" &&
    resource.lifecycleStatus !== "unknown"
  ) {
    const fallbackKey = `diagnostics.reasons.lifecycleStatus.${resource.lifecycleStatus}`;
    reasons.push(t.has(fallbackKey) ? t(fallbackKey) : fallbackKey);
  }
  return reasons.join("，") || t("statusValues.unknown");
}

function attentionRowColor(resource: ResourceListViewModel): string {
  return HEALTH_BORDER[resource.healthStatus] ?? HEALTH_BORDER[resource.lifecycleStatus] ?? "";
}

const ATTENTION_PAGE_SIZE = 10;

export function OverviewContent({
  resources,
  attentionResources,
}: OverviewContentProps) {
  const t = useTranslations();
  const { currentEnvironmentId } = useEnvironment();

  const filteredResources = useMemo(
    () =>
      currentEnvironmentId
        ? resources.filter((r) => r.environmentId === currentEnvironmentId)
        : resources,
    [resources, currentEnvironmentId],
  );

  const filteredAttention = useMemo(
    () =>
      currentEnvironmentId
        ? attentionResources.filter(
            (r) => r.environmentId === currentEnvironmentId,
          )
        : attentionResources,
    [attentionResources, currentEnvironmentId],
  );

  const metrics = useMemo(
    () => computeMetrics(filteredResources),
    [filteredResources],
  );

  const sortedAttention = useMemo(
    () =>
      [...filteredAttention]
        .filter(isActionableAttention)
        .sort((a, b) => severityRank(a) - severityRank(b))
        .slice(0, ATTENTION_PAGE_SIZE),
    [filteredAttention],
  );

  const hasMoreAttention = filteredAttention.filter(isActionableAttention).length > ATTENTION_PAGE_SIZE;

  const barTotal = metrics.critical + metrics.warning + metrics.pending;

  return (
    <div className="space-y-6">
      {/* Posture: 4-column segmented grid + proportional bar */}
      <DetailPanel
        title={t("pages.overview.posture.title")}
        description={t("pages.overview.posture.description")}
      >
        <div className="grid grid-cols-2 rounded-lg border border-border divide-x divide-border overflow-hidden sm:grid-cols-4 divide-y sm:divide-y-0">
          <div className="bg-background px-4 py-4 border-l-2 border-l-primary">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("pages.overview.posture.total")}
            </p>
            <p className="mt-1 text-2xl font-semibold text-foreground">
              {metrics.total}
            </p>
          </div>
          <div className="bg-background px-4 py-4 border-l-2 border-l-rose-500">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("pages.overview.posture.degraded")}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${HEALTH_METRIC_TEXT.critical}`}>
              {metrics.critical}
            </p>
          </div>
          <div className="bg-background px-4 py-4 border-l-2 border-l-yellow-500 dark:border-l-yellow-400">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("pages.overview.posture.warning")}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${HEALTH_METRIC_TEXT.warning}`}>
              {metrics.warning}
            </p>
          </div>
          <div className="bg-background px-4 py-4 border-l-2 border-l-sky-500">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("pages.overview.posture.pending")}
            </p>
            <p className={`mt-1 text-2xl font-semibold ${HEALTH_METRIC_TEXT.pending}`}>
              {metrics.pending}
            </p>
          </div>
        </div>

        {barTotal > 0 && metrics.total > 0 && (
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {metrics.critical > 0 && (
              <div
                className={`${POSTURE_BAR_COLORS.critical} transition-[width] duration-300`}
                style={{ width: `${(metrics.critical / metrics.total) * 100}%` }}
              />
            )}
            {metrics.warning > 0 && (
              <div
                className={`${POSTURE_BAR_COLORS.warning} transition-[width] duration-300`}
                style={{ width: `${(metrics.warning / metrics.total) * 100}%` }}
              />
            )}
            {metrics.pending > 0 && (
              <div
                className={`${POSTURE_BAR_COLORS.pending} transition-[width] duration-300`}
                style={{ width: `${(metrics.pending / metrics.total) * 100}%` }}
              />
            )}
          </div>
        )}
      </DetailPanel>

      {/* Attention queue */}
      {sortedAttention.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-3 text-center text-sm text-muted-foreground">
          {t("pages.overview.attention.emptyDescription")}
        </div>
      ) : (
        <DetailPanel
          title={t("pages.overview.attention.title")}
          description={t("pages.overview.attention.description")}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label={t("pages.overview.attention.title")}>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.resource")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.resourceType")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.environment")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.status")}
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("pages.overview.attention.reasonColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAttention.map((resource) => (
                  <tr
                    key={resource.id}
                    className={`border-b border-border/50 transition-colors hover:bg-muted/30 ${attentionRowColor(resource)}`}
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/resources/${resource.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {resource.displayName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {localizeResourceType(resource.resourceType, t)}
                      {resource.resourceSubtype
                        ? ` / ${formatLabel(resource.resourceSubtype)}`
                        : ""}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {resource.environmentName}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <StatusBadge
                          status={resource.healthStatus}
                          tone="health"
                        />
                        <StatusBadge
                          status={resource.lifecycleStatus}
                          tone="lifecycle"
                        />
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate px-3 py-2 text-muted-foreground">
                      {buildAttentionReason(resource, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMoreAttention && (
              <div className="mt-3 flex justify-end">
                <Link
                  href="/resources?healthStatus=warning&healthStatus=critical"
                  className="text-sm text-primary hover:underline"
                >
                  {t("pages.overview.attention.viewAll")}
                </Link>
              </div>
            )}
          </div>
        </DetailPanel>
      )}
    </div>
  );
}
