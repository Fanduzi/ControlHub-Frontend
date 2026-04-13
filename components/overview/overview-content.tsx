"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { StatusBadge } from "@/components/blocks/status-badge";
import { useEnvironment } from "@/components/providers/environment-provider";
import type {
  AuditEventViewModel,
  ResourceListViewModel,
} from "@/types/view-models";

type OverviewContentProps = {
  resources: ResourceListViewModel[];
  attentionResources: ResourceListViewModel[];
  recentAudits: AuditEventViewModel[];
};

type Metrics = {
  total: number;
  degraded: number;
  warning: number;
  pending: number;
};

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

export function OverviewContent({
  resources,
  attentionResources,
  recentAudits,
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

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DetailPanel
          title={t("attention.title")}
          description={t("attention.description")}
        >
          {filteredAttention.length === 0 ? (
            <EmptyState
              title={t("attention.emptyTitle")}
              description={t("attention.emptyDescription")}
            />
          ) : (
            <div className="space-y-3">
              {filteredAttention.map((resource) => (
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
                      {resource.summary}
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
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DetailPanel
          title={t("lanes.title")}
          description={t("lanes.description")}
        >
          <div className="grid gap-3 md:grid-cols-3">
            {["production", "staging", "development"].map((environment) => {
              const laneResources = filteredResources.filter(
                (resource) =>
                  resource.environmentName.toLowerCase() === environment,
              );

              return (
                <div
                  key={environment}
                  className="rounded-lg border border-border bg-background px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {environment}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-foreground">
                    {laneResources.length}
                  </p>
                  <div className="mt-3 space-y-2">
                    {laneResources.slice(0, 3).map((resource) => (
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
                  </div>
                </div>
              );
            })}
          </div>
        </DetailPanel>

        <DetailPanel
          title={t("recentAudits.title")}
          description={t("recentAudits.description")}
        >
          <ActivityTimeline events={recentAudits} />
        </DetailPanel>
      </div>
    </div>
  );
}
