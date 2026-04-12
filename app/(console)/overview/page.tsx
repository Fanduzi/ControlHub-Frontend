import { getTranslations } from "next-intl/server";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { EmptyState } from "@/components/blocks/empty-state";
import { PageHeader } from "@/components/blocks/page-header";
import { StatusBadge } from "@/components/blocks/status-badge";
import {
  getOverviewMetrics,
  listAttentionResourceViewModels,
  listRecentAuditEventViewModels,
  listResourceViewModels,
} from "@/lib/view-models";

export default async function OverviewPage() {
  const t = await getTranslations("pages.overview");
  const [metrics, attentionResources, resources, recentAudits] =
    await Promise.all([
      getOverviewMetrics(),
      listAttentionResourceViewModels(),
      listResourceViewModels(),
      listRecentAuditEventViewModels(),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DetailPanel
          title={t("attention.title")}
          description={t("attention.description")}
        >
          {attentionResources.length === 0 ? (
            <EmptyState
              title={t("attention.emptyTitle")}
              description={t("attention.emptyDescription")}
            />
          ) : (
            <div className="space-y-3">
              {attentionResources.map((resource) => (
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
              const laneResources = resources.filter(
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
