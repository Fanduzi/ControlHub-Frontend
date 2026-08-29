// input: resource route id, localized resource view model, health evidence, and detail components
// output: full resource detail page with server-derived completeness, health observation metadata, and directed relation creation context
// pos: server-rendered resource detail and operational health inspection surface
// note: if this file changes, update this header and module README.md.

import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { ClusterMembersTable } from "@/components/blocks/cluster-members-table";
import { DeployedResourcesCard } from "@/components/blocks/deployed-resources-card";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { TopologyPanel } from "@/components/blocks/topology-panel";
import { ResourceDetailEditButton } from "@/components/resources/resource-detail-edit-button";
import { ResourceArchiveButton } from "@/components/resources/resource-archive-button";
import { ResourceCompletenessPanel } from "@/components/resources/resource-completeness-panel";
import { DatabaseOperatorWorkbench } from "@/components/resources/database-operator-workbench";
import { DatabaseDecisionDeck } from "@/components/resources/database-decision-deck";
import { DatabaseConsistencyPanel } from "@/components/resources/database-consistency-panel";
import { DatabaseInstanceFactsPanel } from "@/components/resources/database-instance-facts-panel";
import { DatabaseSupportingDetails } from "@/components/resources/database-supporting-details";
import { HealthEvidence } from "@/components/resources/health-evidence";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ResourcesBreadcrumbLink } from "@/components/resources/resources-breadcrumb-link";
import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";
import {
  buildClusterConsistency,
  buildInstanceConsistency,
} from "@/lib/database-read-model-consistency";
import {
  buildLocalizedFallbackSummary,
  localizeResourceType,
} from "@/lib/resource-summary";
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

  if (!/^[1-9]\d*$/.test(id)) {
    notFound();
  }

  const resourceId = Number(id);

  if (!Number.isSafeInteger(resourceId)) {
    notFound();
  }

  const resource = await getResourceViewModel(resourceId);

  if (!resource) {
    notFound();
  }

  const summary = buildLocalizedFallbackSummary(resource, t);
  const profileEntries = Object.entries(resource.profile);
  const completeness = resource.completeness;
  const isDatabaseResource =
    resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance";

  const isDatabaseCluster = resource.resourceType === "database_cluster";
  const isDatabaseInstance = resource.resourceType === "database_instance";

  let topology: import("@/types/resource").TopologyResponse | undefined;
  if (isDatabaseResource) {
    try {
      const { getResourceTopology } = await import("@/services/topology");
      const topologyResponse = await getResourceTopology(resource.id);
      topology = topologyResponse ?? undefined;
    } catch {
      // Topology unavailable — consistency helpers handle undefined gracefully
    }
  }

  const clusterConsistency =
    isDatabaseCluster
      ? buildClusterConsistency({
          resource,
          members: resource.members ?? [],
          topology,
        })
      : null;

  const instanceConsistency =
    isDatabaseInstance
      ? buildInstanceConsistency({ resource, topology })
      : null;

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <ResourcesBreadcrumbLink label={t("navigation.resources.title")} />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <span className="text-sm text-muted-foreground">{resource.displayName}</span>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <PageHeader
        eyebrow={t("pages.resourceDetail.eyebrow")}
        title={resource.displayName}
        description={summary}
        actions={
          <>
            <ResourceArchiveButton resource={resource} />
            <ResourceDetailEditButton resource={resource} />
            {resource.isArchived && (
              <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {t("common.actions.archived")}
              </span>
            )}
            <StatusBadge status={resource.healthStatus} tone="health" />
            <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
            <HealthEvidence resource={resource} locale={locale} />
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
                {localizeResourceType(resource.resourceType, t)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.resourceSubtype")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.resourceSubtype ? (
                  <span className="inline-flex items-center gap-1.5">
                    {(resource.resourceType === "database_instance" ||
                      resource.resourceType === "database_cluster" ||
                      resource.resourceType === "database_proxy") && (
                      <DbTypeIcon subtype={resource.resourceSubtype} className="size-4" />
                    )}
                    {formatLabel(resource.resourceSubtype)}
                  </span>
                ) : (
                  t("common.notSet")
                )}
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
              {Object.keys(resource.labels).length === 0 ? (
                <span className="text-sm text-muted-foreground">{t("common.notSet")}</span>
              ) : (
                Object.entries(resource.labels).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
                  >
                    {key}: {value}
                  </span>
                ))
              )}
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

      {completeness && (
        <ResourceCompletenessPanel completeness={completeness} />
      )}

      {isDatabaseResource && (
        <DatabaseDecisionDeck
          resource={resource}
          members={resource.members ?? []}
          recentAudits={resource.recentAudits ?? []}
        />
      )}

      {resource.resourceType === "database_cluster" &&
        resource.members &&
        resource.members.length > 0 && (
          <DetailPanel
            title={t("pages.resourceDetail.clusterMembers.title")}
            description={t("pages.resourceDetail.clusterMembers.description")}
          >
            <ClusterMembersTable members={resource.members} />
          </DetailPanel>
        )}

      {isDatabaseResource && (
        <DetailPanel
          title={t("topology.title")}
          description={t("topology.description")}
          className="xl:col-span-2"
        >
          <div data-resource-topology-surface="prominent">
            <TopologyPanel
              key={`${resource.id}:${resource.isArchived}`}
              resourceId={resource.id}
              urlSync
              initialTopology={topology}
            />
          </div>
        </DetailPanel>
      )}

      {isDatabaseCluster && clusterConsistency ? (
        <DatabaseConsistencyPanel scope="cluster" result={clusterConsistency} />
      ) : null}

      {isDatabaseInstance && instanceConsistency ? (
        <DatabaseInstanceFactsPanel result={instanceConsistency} />
      ) : null}

      {isDatabaseResource && (
        <DatabaseOperatorWorkbench
          resource={resource}
          members={resource.members ?? []}
          clusterInfo={resource.clusterInfo}
          recentAudits={resource.recentAudits}
        />
      )}

      {resource.resourceType === "database_cluster" && resource.profileSummary && (
        <DetailPanel
          title={t("pages.resourceDetail.operatorSummary.title")}
          description={t("pages.resourceDetail.operatorSummary.description")}
        >
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            {resource.profileSummary.nodeCount != null && (
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.nodes")}
                </dt>
                <dd className="mt-1 text-2xl font-semibold text-foreground">
                  {resource.profileSummary.nodeCount}
                </dd>
              </div>
            )}
            {resource.profileSummary.engine && (
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.engine")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {resource.profileSummary.engine}
                </dd>
              </div>
            )}
            {resource.profileSummary.version && (
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("profileFields.version")}
                </dt>
                <dd className="mt-1 font-mono text-sm font-medium text-foreground">
                  {resource.profileSummary.version}
                </dd>
              </div>
            )}
          </dl>
        </DetailPanel>
      )}

      {resource.resourceType === "host" && (
        <DetailPanel
          title={t("pages.resourceDetail.deployedResources.title")}
          description={t("pages.resourceDetail.deployedResources.description")}
        >
          <DeployedResourcesCard relations={resource.relations} />
        </DetailPanel>
      )}

      {resource.isArchived && (
        <DetailPanel
          title={t("archive.metadataTitle")}
          description=""
        >
          <dl className="grid gap-3 text-sm md:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.archivedAt")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.archivedAt ? formatDateTime(resource.archivedAt, locale) : t("common.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.archivedBy")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.archivedBy || t("common.notSet")}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("common.fields.archiveReason")}
              </dt>
              <dd className="mt-1 font-medium text-foreground">
                {resource.archiveReason || t("common.notSet")}
              </dd>
            </div>
          </dl>
        </DetailPanel>
      )}

      {isDatabaseResource ? (
        <DatabaseSupportingDetails
          primary={
            <DetailPanel
              title={t("pages.resourceDetail.profile.title")}
              description={t("pages.resourceDetail.profile.description")}
            >
              <div data-resource-profile-surface="supporting">
                {profileEntries.length ? (
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
              </div>
            </DetailPanel>
          }
          secondary={
            <DetailPanel
              title={t("pages.resourceDetail.relations.title")}
              description={t("pages.resourceDetail.relations.description")}
            >
              <ResourceRelationPanel
                relations={resource.relations}
                resourceId={resource.id}
                resourceType={resource.resourceType}
                environmentId={resource.environmentId}
              />
            </DetailPanel>
          }
          fullWidth={
            <DetailPanel
              title={t("pages.resourceDetail.audit.title")}
              description={t("pages.resourceDetail.audit.description")}
            >
              <ActivityTimeline events={resource.auditEvents} locale={locale} />
            </DetailPanel>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <DetailPanel
              title={t("pages.resourceDetail.profile.title")}
              description={t("pages.resourceDetail.profile.description")}
            >
              <div data-resource-profile-surface="supporting">
                {profileEntries.length ? (
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
              </div>
            </DetailPanel>

            <DetailPanel
              title={t("pages.resourceDetail.relations.title")}
              description={t("pages.resourceDetail.relations.description")}
            >
              <ResourceRelationPanel
                relations={resource.relations}
                resourceId={resource.id}
                resourceType={resource.resourceType}
                environmentId={resource.environmentId}
              />
            </DetailPanel>
          </div>

          <DetailPanel
            title={t("topology.title")}
            description={t("topology.description")}
            className="xl:col-span-2"
          >
            <div data-resource-topology-surface="prominent">
              <TopologyPanel
                key={`${resource.id}:${resource.isArchived}`}
                resourceId={resource.id}
                urlSync
              />
            </div>
          </DetailPanel>

          <DetailPanel
            title={t("pages.resourceDetail.audit.title")}
            description={t("pages.resourceDetail.audit.description")}
          >
            <ActivityTimeline events={resource.auditEvents} locale={locale} />
          </DetailPanel>
        </>
      )}
    </div>
  );
}
