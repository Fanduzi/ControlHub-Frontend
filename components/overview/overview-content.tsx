"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { StatusBadge } from "@/components/blocks/status-badge";
import { useEnvironment } from "@/components/providers/environment-provider";
import { formatLabel } from "@/lib/format";
import type { ResourceListViewModel } from "@/types/view-models";

type OverviewContentProps = {
  resources: ResourceListViewModel[];
  attentionResources: ResourceListViewModel[];
};

type Metrics = {
  total: number;
  degraded: number;
  warning: number;
  pending: number;
};

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  degraded: 1,
  warning: 2,
  healthy: 3,
  unknown: 4,
};

function severityRank(resource: ResourceListViewModel): number {
  return SEVERITY_ORDER[resource.healthStatus] ?? 99;
}

function isActionableAttention(resource: ResourceListViewModel): boolean {
  const actionableHealth = ["critical", "degraded", "warning"].includes(
    resource.healthStatus,
  );
  const actionableLifecycle = resource.lifecycleStatus !== "running";
  // Exclude resources that are only "unknown" health with no other signal
  if (
    resource.healthStatus === "unknown" &&
    resource.lifecycleStatus === "running"
  ) {
    return false;
  }
  return actionableHealth || actionableLifecycle;
}

function computeMetrics(resources: ResourceListViewModel[]): Metrics {
  return {
    total: resources.length,
    degraded: resources.filter(
      (r) => r.healthStatus === "degraded" || r.healthStatus === "critical",
    ).length,
    warning: resources.filter((r) => r.healthStatus === "warning").length,
    pending: resources.filter((r) => r.lifecycleStatus === "pending").length,
  };
}

function buildAttentionReason(
  resource: ResourceListViewModel,
  t: ReturnType<typeof useTranslations>,
): string {
  const reasons: string[] = [];
  const healthKey = `statusValues.${resource.healthStatus}`;
  const healthLabel = t.has(healthKey) ? t(healthKey) : resource.healthStatus;

  if (resource.healthStatus === "critical" || resource.healthStatus === "degraded" || resource.healthStatus === "warning") {
    reasons.push(`${t("common.fields.health")}=${healthLabel}`);
  }
  if (
    resource.lifecycleStatus !== "running" &&
    resource.lifecycleStatus !== "unknown"
  ) {
    const lifecycleKey = `statusValues.${resource.lifecycleStatus}`;
    const lifecycleLabel = t.has(lifecycleKey) ? t(lifecycleKey) : resource.lifecycleStatus;
    reasons.push(`${t("common.fields.lifecycle")}=${lifecycleLabel}`);
  }
  return reasons.join(", ") || t("statusValues.unknown");
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

  // Filter to only actionable attention items and sort by severity
  const sortedAttention = useMemo(
    () =>
      [...filteredAttention]
        .filter(isActionableAttention)
        .sort((a, b) => severityRank(a) - severityRank(b))
        .slice(0, ATTENTION_PAGE_SIZE),
    [filteredAttention],
  );

  const hasMoreAttention = filteredAttention.filter(isActionableAttention).length > ATTENTION_PAGE_SIZE;

  return (
    <div className="space-y-6">
      {/* Row 1: Resource posture metrics */}
      <DetailPanel
        title={t("pages.overview.posture.title")}
        description={t("pages.overview.posture.description")}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("pages.overview.posture.total")}
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {metrics.total}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.overview.posture.degraded")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-600 dark:text-rose-400">
                {metrics.degraded}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.overview.posture.warning")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-400">
                {metrics.warning}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.overview.posture.pending")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-sky-600 dark:text-sky-400">
                {metrics.pending}
              </p>
            </div>
          </div>
        </div>
      </DetailPanel>

      {/* Row 2: Attention queue — data-dense table */}
      <DetailPanel
        title={t("pages.overview.attention.title")}
        description={t("pages.overview.attention.description")}
      >
        {sortedAttention.length === 0 ? (
          <EmptyState
            title={t("pages.overview.attention.emptyTitle")}
            description={t("pages.overview.attention.emptyDescription")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.resource")}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.resourceType")}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.environment")}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("common.fields.status")}
                  </th>
                  <th className="px-3 py-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
                    {t("pages.overview.attention.reasonColumn")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAttention.map((resource) => (
                  <tr
                    key={resource.id}
                    className="border-b border-border/50 transition-colors hover:bg-muted/30"
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
                      {formatLabel(resource.resourceType)}
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
                    <td className="px-3 py-2 text-muted-foreground">
                      {buildAttentionReason(resource, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMoreAttention && (
              <div className="mt-3 flex justify-end">
                <Link
                  href="/resources?healthStatus=degraded&healthStatus=warning&healthStatus=critical"
                  className="text-sm text-primary hover:underline"
                >
                  {t("pages.overview.attention.viewAll")}
                </Link>
              </div>
            )}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
