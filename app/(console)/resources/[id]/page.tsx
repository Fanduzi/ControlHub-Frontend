import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { formatDateTime, formatLabel } from "@/lib/format";
import { getResourceViewModel } from "@/lib/view-models";

type ResourceDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ResourceDetailPage({
  params,
}: ResourceDetailPageProps) {
  const { id } = await params;
  const resource = await getResourceViewModel(id);

  if (!resource) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Resource Detail"
        title={resource.displayName}
        description={resource.summary}
        actions={
          <>
            <StatusBadge status={resource.healthStatus} tone="health" />
            <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DetailPanel
          title="Identity and ownership"
          description="Core fields mirror the resource contract names used by the backend."
        >
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Resource type
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatLabel(resource.resourceType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Resource subtype
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatLabel(resource.resourceSubtype)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Environment
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.environmentName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Owner
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.ownerName}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                External ID
              </dt>
              <dd className="mt-1 break-all font-medium text-foreground">
                {resource.externalId || "Not set"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Last updated
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatDateTime(resource.updatedAt)}
              </dd>
            </div>
          </dl>
        </DetailPanel>

        <DetailPanel
          title="Labels and source"
          description="Wire data keeps labels in a key-value map; the page presents them without mutating the contract."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(resource.labels).map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                >
                  {key}: {value}
                </span>
              ))}
            </div>
            <div className="rounded-lg border border-border bg-background px-3 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Source
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{resource.source}</p>
            </div>
          </div>
        </DetailPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DetailPanel
          title="Operational profile"
          description="Typed extension fields remain explicit and readable on the detail page."
        >
          <dl className="grid gap-3 md:grid-cols-2">
            {Object.entries(resource.profile).map(([key, value]) => (
              <div key={key} className="rounded-lg border border-border bg-background px-3 py-3">
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {formatLabel(key)}
                </dt>
                <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </DetailPanel>

        <DetailPanel
          title="Relations"
          description="Dependencies, containment, and ownership context anchored to resource IDs."
        >
          <ResourceRelationPanel relations={resource.relations} />
        </DetailPanel>
      </div>

      <DetailPanel
        title="Audit history"
        description="Recent changes to the asset baseline for this resource."
      >
        <ActivityTimeline events={resource.auditEvents} />
      </DetailPanel>
    </div>
  );
}
