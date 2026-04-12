import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";
import { getResourceSummaryKey } from "@/lib/resource-copy";
import { getResourceViewModel } from "@/lib/view-models";

type ResourceDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ResourceDetailPage({
  params,
}: ResourceDetailPageProps) {
  const [localeValue, t] = await Promise.all([
    getLocale(),
    getTranslations(),
  ]);
  const locale = isAppLocale(localeValue) ? localeValue : DEFAULT_LOCALE;
  const { id } = await params;
  const resource = await getResourceViewModel(id);

  if (!resource) {
    notFound();
  }

  const summaryKey = getResourceSummaryKey(resource.id);
  const summary =
    summaryKey && t.has(`resourceSummaries.${summaryKey}`)
      ? t(`resourceSummaries.${summaryKey}`)
      : resource.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.resourceDetail.eyebrow")}
        title={resource.displayName}
        description={summary}
        actions={
          <>
            <StatusBadge status={resource.healthStatus} tone="health" />
            <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <DetailPanel
          title={t("pages.resourceDetail.identity.title")}
          description={t("pages.resourceDetail.identity.description")}
        >
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.resourceType")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatLabel(resource.resourceType)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.resourceSubtype")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatLabel(resource.resourceSubtype)}
              </dd>
            </div>
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
                {t("common.fields.externalId")}
              </dt>
              <dd className="mt-1 break-all font-medium text-foreground">
                {resource.externalId || t("common.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.lastUpdated")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {formatDateTime(resource.updatedAt, locale)}
              </dd>
            </div>
          </dl>
        </DetailPanel>

        <DetailPanel
          title={t("pages.resourceDetail.labels.title")}
          description={t("pages.resourceDetail.labels.description")}
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
                {t("common.fields.source")}
              </p>
              <p className="mt-1 text-sm font-medium text-foreground">{resource.source}</p>
            </div>
          </div>
        </DetailPanel>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <DetailPanel
          title={t("pages.resourceDetail.profile.title")}
          description={t("pages.resourceDetail.profile.description")}
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
          title={t("pages.resourceDetail.relations.title")}
          description={t("pages.resourceDetail.relations.description")}
        >
          <ResourceRelationPanel relations={resource.relations} />
        </DetailPanel>
      </div>

      <DetailPanel
        title={t("pages.resourceDetail.audit.title")}
        description={t("pages.resourceDetail.audit.description")}
      >
        <ActivityTimeline events={resource.auditEvents} locale={locale} />
      </DetailPanel>
    </div>
  );
}
