"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

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
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatLabel } from "@/lib/format";
import { getResourceSummaryKey } from "@/lib/resource-copy";
import type {
  ResourceDetailViewModel,
  ResourceListViewModel,
} from "@/types/view-models";

type ResourceDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceListViewModel | ResourceDetailViewModel | null;
  loading?: boolean;
};

function hasDetailData(
  resource: ResourceListViewModel | ResourceDetailViewModel,
): resource is ResourceDetailViewModel {
  return (
    "profile" in resource && "relations" in resource && "auditEvents" in resource
  );
}

export function ResourceDetailSheet({
  open,
  onOpenChange,
  resource,
  loading = false,
}: ResourceDetailSheetProps) {
  const t = useTranslations();
  const locale = useLocale();

  if (!resource) {
    return null;
  }

  const summaryKey = getResourceSummaryKey(resource.id);
  const summary =
    summaryKey && t.has(`resourceSummaries.${summaryKey}`)
      ? t(`resourceSummaries.${summaryKey}`)
      : resource.summary;
  const detailResource = hasDetailData(resource) ? resource : null;
  const profileEntries = detailResource
    ? Object.entries(detailResource.profile)
    : [];
  const relations = detailResource?.relations ?? [];
  const auditEvents = detailResource?.auditEvents ?? [];

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
          <DetailPanel title={t("detailSheet.summary")} description={summary}>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.environment")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {resource.environmentName}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.owner")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {resource.ownerName}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.source")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">{resource.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.updated")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {formatDateTime(resource.updatedAt, locale as never)}
                </dd>
              </div>
            </dl>
          </DetailPanel>

          <DetailPanel
            title={t("detailSheet.profile")}
            description={t("detailSheet.profileDescription")}
          >
            {loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    key={`profile-skeleton-${index}`}
                    className="rounded-lg border border-border bg-background px-3 py-3"
                  >
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-3 h-4 w-full" />
                  </div>
                ))}
              </div>
            ) : profileEntries.length ? (
              <dl className="grid gap-3 md:grid-cols-2">
                {profileEntries.map(([key, value]) => (
                  <div key={key} className="rounded-lg border border-border bg-background px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {formatLabel(key)}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("common.notSet")}</p>
            )}
          </DetailPanel>

          <DetailPanel
            title={t("pages.resourceDetail.relations.title")}
            description={t("detailSheet.relationsDescription")}
          >
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : (
              <ResourceRelationPanel relations={relations} />
            )}
          </DetailPanel>

          <DetailPanel
            title={t("detailSheet.audit")}
            description={t("detailSheet.auditDescription")}
          >
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <ActivityTimeline
                events={auditEvents}
                emptyTitle={t("detailSheet.emptyAuditTitle")}
                emptyDescription={t("detailSheet.emptyAuditDescription")}
              />
            )}
          </DetailPanel>

          <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-4">
            <div>
              <p className="text-sm font-medium text-foreground">{t("detailSheet.inspectionTitle")}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("detailSheet.inspectionDescription")}
              </p>
            </div>
            <Link
              href={`/resources/${resource.id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("common.actions.openFullDetail")}
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
