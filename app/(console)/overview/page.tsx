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
        eyebrow="Overview"
        title="Operational posture across shared resources"
        description="Overview stays close to the work: attention queues, environment posture, asset ownership, and recent changes instead of a generic dashboard."
      />

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <DetailPanel
          title="Attention queue"
          description="Resources needing immediate operator context or ownership follow-up."
        >
          {attentionResources.length === 0 ? (
            <EmptyState
              title="No attention items"
              description="All resources are healthy and running."
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
          title="Resource posture"
          description="Counts emphasize actionability rather than vanity totals."
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Total managed assets
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {metrics.total}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-background px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Degraded
                </p>
                <p className="mt-2 text-2xl font-semibold text-rose-700">
                  {metrics.degraded}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Warning
                </p>
                <p className="mt-2 text-2xl font-semibold text-amber-700">
                  {metrics.warning}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background px-4 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Pending
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
          title="Environment lanes"
          description="Each lane compresses health, ownership, and scope by environment."
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
          title="Recent audit events"
          description="Latest changes to the shared resource baseline."
        >
          <ActivityTimeline events={recentAudits} />
        </DetailPanel>
      </div>
    </div>
  );
}
