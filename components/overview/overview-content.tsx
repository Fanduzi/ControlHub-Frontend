"use client";

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

function buildFallbackSummary(resource: ResourceListViewModel): string {
  const parts = [
    formatLabel(resource.resourceType),
    resource.environmentName,
    formatLabel(resource.lifecycleStatus),
  ].filter(Boolean);
  return parts.join(" \u00B7 ");
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

type EnvironmentGroup = {
  environmentId: string;
  environmentName: string;
  total: number;
  critical: number;
  warning: number;
  healthy: number;
  abnormalResources: ResourceListViewModel[];
};

function groupByEnvironment(
  resources: ResourceListViewModel[],
): EnvironmentGroup[] {
  const groups = new Map<string, EnvironmentGroup>();

  for (const resource of resources) {
    const key = resource.environmentId;
    const existing = groups.get(key);

    if (existing) {
      existing.total += 1;
      if (
        resource.healthStatus === "critical" ||
        resource.healthStatus === "degraded"
      ) {
        existing.critical += 1;
      } else if (resource.healthStatus === "warning") {
        existing.warning += 1;
      } else if (resource.healthStatus === "healthy") {
        existing.healthy += 1;
      }
      if (
        resource.healthStatus !== "healthy" &&
        resource.healthStatus !== "unknown"
      ) {
        existing.abnormalResources.push(resource);
      }
    } else {
      const abnormalResources: ResourceListViewModel[] = [];
      let critical = 0;
      let warning = 0;
      let healthy = 0;

      if (
        resource.healthStatus === "critical" ||
        resource.healthStatus === "degraded"
      ) {
        critical = 1;
        abnormalResources.push(resource);
      } else if (resource.healthStatus === "warning") {
        warning = 1;
        abnormalResources.push(resource);
      } else if (resource.healthStatus === "healthy") {
        healthy = 1;
      }

      groups.set(key, {
        environmentId: resource.environmentId,
        environmentName: resource.environmentName,
        total: 1,
        critical,
        warning,
        healthy,
        abnormalResources,
      });
    }
  }

  return Array.from(groups.values()).map((group) => ({
    ...group,
    abnormalResources: [...group.abnormalResources]
      .sort((a, b) => severityRank(a) - severityRank(b))
      .slice(0, 3),
  }));
}

export function OverviewContent({
  resources,
  attentionResources,
}: OverviewContentProps) {
  const t = useTranslations("pages.overview");
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
    () => [...filteredAttention].sort((a, b) => severityRank(a) - severityRank(b)),
    [filteredAttention],
  );

  const environmentGroups = useMemo(
    () => groupByEnvironment(filteredResources),
    [filteredResources],
  );

  return (
    <div className="space-y-6">
      {/* Row 1: Resource posture metrics */}
      <DetailPanel
        title={t("posture.title")}
        description={t("posture.description")}
      >
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-background px-4 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {t("posture.total")}
            </p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {metrics.total}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("posture.degraded")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-rose-700">
                {metrics.degraded}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("posture.warning")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-amber-700">
                {metrics.warning}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("posture.pending")}
              </p>
              <p className="mt-2 text-2xl font-semibold text-sky-700">
                {metrics.pending}
              </p>
            </div>
          </div>
        </div>
      </DetailPanel>

      {/* Row 2: Attention queue with severity ordering */}
      <DetailPanel
        title={t("attention.title")}
        description={t("attention.description")}
      >
        {sortedAttention.length === 0 ? (
          <EmptyState
            title={t("attention.emptyTitle")}
            description={t("attention.emptyDescription")}
          />
        ) : (
          <div className="space-y-3">
            {sortedAttention.map((resource) => (
              <div
                key={resource.id}
                className="grid gap-3 rounded-lg border border-border bg-background px-4 py-4 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">
                      {resource.displayName}
                    </p>
                    <StatusBadge
                      status={resource.healthStatus}
                      tone="health"
                    />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {buildFallbackSummary(resource)}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>{resource.environmentName}</p>
                  <p>{resource.ownerName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DetailPanel>

      {/* Row 3: Environment summary cards */}
      <DetailPanel
        title={t("environmentSummary.title")}
        description={t("environmentSummary.description")}
      >
        {environmentGroups.length === 0 ? (
          <EmptyState
            title={t("environmentSummary.noResources")}
            description=""
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {environmentGroups.map((group) => (
              <div
                key={group.environmentId}
                className="rounded-lg border border-border bg-background px-4 py-4"
              >
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {group.environmentName}
                </p>
                <p className="mt-2 text-2xl font-semibold text-foreground">
                  {t("environmentSummary.totalResources", {
                    count: group.total,
                  })}
                </p>
                <div className="mt-3 flex gap-4 text-sm">
                  <span className="text-rose-700">
                    {group.critical} {t("posture.degraded").toLowerCase()}
                  </span>
                  <span className="text-amber-700">
                    {group.warning} {t("posture.warning").toLowerCase()}
                  </span>
                  <span className="text-emerald-700">
                    {group.healthy} {t("posture.total").split(" ").pop()}
                  </span>
                </div>
                {group.abnormalResources.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {group.abnormalResources.map((resource) => (
                      <div
                        key={resource.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sm text-foreground">
                          {resource.displayName}
                        </span>
                        <StatusBadge
                          status={resource.healthStatus}
                          tone="health"
                        />
                      </div>
                    ))}
                    {group.abnormalResources.length < group.critical + group.warning && (
                      <p className="text-xs text-muted-foreground">
                        {t("environmentSummary.showingTop", {
                          shown: group.abnormalResources.length,
                          total: group.critical + group.warning,
                        })}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DetailPanel>
    </div>
  );
}
