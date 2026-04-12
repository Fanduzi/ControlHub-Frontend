"use client";

import Link from "next/link";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { ResourceViewModel } from "@/types/view-models";

type ResourceDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceViewModel | null;
};

export function ResourceDetailSheet({
  open,
  onOpenChange,
  resource,
}: ResourceDetailSheetProps) {
  if (!resource) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto border-l border-border bg-background sm:max-w-2xl">
        <SheetHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle>{resource.displayName}</SheetTitle>
              <SheetDescription className="mt-1">
                {resource.name} · {formatLabel(resource.resourceType)}
              </SheetDescription>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={resource.healthStatus} tone="health" />
              <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 px-6 py-5">
          <DetailPanel title="Summary" description={resource.summary}>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
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
                  Source
                </dt>
                <dd className="mt-1 font-medium text-foreground">{resource.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Updated
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {formatDateTime(resource.updatedAt)}
                </dd>
              </div>
            </dl>
          </DetailPanel>

          <DetailPanel
            title="Operational Profile"
            description="High-frequency fields stay explicit; vendor detail remains supplemental."
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
            description="List-row context should immediately expose upstream and downstream dependencies."
          >
            <ResourceRelationPanel relations={resource.relations} />
          </DetailPanel>

          <DetailPanel
            title="Audit Activity"
            description="Baseline changes captured for ownership and asset maintenance."
          >
            <ActivityTimeline
              events={resource.auditEvents}
              emptyTitle="No audit activity yet"
              emptyDescription="Audit signals will show up here once the backend event feed is available."
            />
          </DetailPanel>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">Need deeper inspection?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Open the dedicated detail page for the full resource record.
              </p>
            </div>
            <Link
              href={`/resources/${resource.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open full detail
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
