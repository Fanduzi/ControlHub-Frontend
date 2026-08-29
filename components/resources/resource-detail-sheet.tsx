// input: resource view models, health/effective-value evidence, localization, auth role, services, and mutation controls
// output: resource detail sheet with server-derived completeness, observation/provenance metadata, and admin edit/archive/override affordances
// pos: authenticated resource detail, completeness, health evidence, and effective-value interaction surface
// note: if this file changes, update this header and module README.md.
"use client";

import { useEffect, useState } from "react";
import { useAdminRole } from "@/lib/auth-role";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { ResourceRelationPanel } from "@/components/blocks/resource-relation-panel";
import { StatusBadge } from "@/components/blocks/status-badge";
import { TopologyPanel } from "@/components/blocks/topology-panel";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatLabel } from "@/lib/format";
import { ApiError } from "@/services/api-client";
import {
  buildLocalizedFallbackSummary,
  localizeResourceType,
} from "@/lib/resource-summary";
import type {
  ResourceDetailViewModel,
  ResourceListViewModel,
} from "@/types/view-models";
import {
  clearResourceOverride,
  getEffectiveValues,
  setResourceOverride,
} from "@/services/resources";
import type {
  EffectiveValue,
  EffectiveValuesResponse,
  ResourceOverrideField,
} from "@/types/resource";

import { EditResourceSheet } from "./edit-resource-sheet";
import { ResourceArchiveButton } from "./resource-archive-button";
import { ResourceCompletenessPanel } from "./resource-completeness-panel";
import { HealthEvidence } from "./health-evidence";

type ResourceDetailSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceListViewModel | ResourceDetailViewModel | null;
  loading?: boolean;
  onArchiveChange?: () => void;
};

function hasDetailData(
  resource: ResourceListViewModel | ResourceDetailViewModel,
): resource is ResourceDetailViewModel {
  return (
    "profile" in resource &&
    "relations" in resource &&
    "auditEvents" in resource
  );
}

const overrideFields: ResourceOverrideField[] = [
  "displayName",
  "lifecycleStatus",
  "healthStatus",
];

function isOverrideField(key: string): key is ResourceOverrideField {
  return overrideFields.includes(key as ResourceOverrideField);
}

function overrideDrafts(values: EffectiveValuesResponse["values"]) {
  return Object.fromEntries(
    overrideFields.map((field) => [
      field,
      values[field]?.value == null ? "" : String(values[field].value),
    ]),
  ) as Partial<Record<ResourceOverrideField, string>>;
}

function errorText(
  error: unknown,
  translate: ReturnType<typeof useTranslations>,
) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "resource_conflict":
        return translate("mutations.errors.resourceConflict");
      case "unauthorized":
        return translate("mutations.errors.unauthorized");
      case "resource_not_found":
        return translate("mutations.errors.notFound");
      case "validation_failed":
        return translate("mutations.errors.validation");
      default:
        return translate("mutations.errors.backend");
    }
  }
  return translate("mutations.errors.unknown");
}

export function ResourceDetailSheet({
  open,
  onOpenChange,
  resource,
  loading = false,
  onArchiveChange,
}: ResourceDetailSheetProps) {
  const t = useTranslations();
  const locale = useLocale();
  const [editOpen, setEditOpen] = useState(false);
  const [effectiveValues, setEffectiveValues] = useState<
    EffectiveValuesResponse["values"]
  >({});
  const [overrideDraft, setOverrideDraft] = useState<
    Partial<Record<ResourceOverrideField, string>>
  >({});
  const [effectiveLoading, setEffectiveLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideBusy, setOverrideBusy] = useState<ResourceOverrideField | null>(null);
  const isAdmin = useAdminRole();
  const resourceId = resource?.id;

  useEffect(() => {
    if (!open || resourceId === undefined) return undefined;

    let cancelled = false;
    setEffectiveLoading(true);
    setOverrideError(null);
    setEffectiveValues({});

    Promise.resolve(getEffectiveValues(resourceId))
      .then((response) => {
        if (!cancelled && response) {
          setEffectiveValues(response.values);
          setOverrideDraft(overrideDrafts(response.values));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setOverrideError(errorText(error, t));
      })
      .finally(() => {
        if (!cancelled) setEffectiveLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, resourceId, t]);

  async function refreshEffectiveValues() {
    const response = await getEffectiveValues(resourceId as number);
    setEffectiveValues(response.values);
    setOverrideDraft(overrideDrafts(response.values));
  }

  async function saveOverride(field: ResourceOverrideField) {
    setOverrideBusy(field);
    setOverrideError(null);
    try {
      await setResourceOverride(
        resourceId as number,
        field,
        overrideDraft[field] ?? "",
        effectiveValues[field]?.provenance.version ?? 0,
      );
      await refreshEffectiveValues();
    } catch (error) {
      setOverrideError(errorText(error, t));
    } finally {
      setOverrideBusy(null);
    }
  }

  async function clearOverride(field: ResourceOverrideField) {
    setOverrideBusy(field);
    setOverrideError(null);
    try {
      await clearResourceOverride(
        resourceId as number,
        field,
        effectiveValues[field]?.provenance.version ?? 0,
      );
      await refreshEffectiveValues();
    } catch (error) {
      setOverrideError(errorText(error, t));
    } finally {
      setOverrideBusy(null);
    }
  }

  if (!resource) {
    return null;
  }

  const summary = buildLocalizedFallbackSummary(resource, t);
  const detailResource = hasDetailData(resource) ? resource : null;
  const profileEntries = detailResource
    ? Object.entries(detailResource.profile)
    : [];
  const effectiveEntries = Object.entries(effectiveValues);
  const relations = detailResource?.relations ?? [];
  const auditEvents = detailResource?.auditEvents ?? [];
  const completeness = resource.completeness;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="overflow-y-auto border-l border-border bg-background"
        onOverlayClick={() => onOpenChange(false)}
      >
        <SheetHeader className="border-b border-border px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <SheetTitle>{resource.displayName}</SheetTitle>
              <SheetDescription className="mt-1">
                <span className="inline-flex items-center gap-1.5">
                  {(resource.resourceType === "database_instance" ||
                    resource.resourceType === "database_cluster" ||
                    resource.resourceType === "database_proxy") && (
                    <DbTypeIcon subtype={resource.resourceSubtype} className="size-4" />
                  )}
                  {resource.name} · {localizeResourceType(resource.resourceType, t)}
                </span>
              </SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={`/resources/${resource.id}`}
                className={buttonVariants({ variant: "outline", size: "xs" })}
              >
                {t("common.actions.openFullDetail")}
              </Link>
              {isAdmin === true && (
                <ResourceArchiveButton
                  resource={resource}
                  compact
                  onArchiveChange={onArchiveChange}
                />
              )}
              {isAdmin === true && (
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => setEditOpen(true)}
                  disabled={!detailResource || loading}
                >
                  {t("common.actions.editResource")}
                </Button>
              )}
              {resource.isArchived && (
                <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                  {t("common.actions.archived")}
                </span>
              )}
              <StatusBadge status={resource.healthStatus} tone="health" />
              <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
              <HealthEvidence resource={resource} locale={locale} />
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
                  {t("common.fields.origin")}
                </dt>
                <dd className="mt-1 font-medium text-foreground">
                  {t(`common.origins.${resource.origin ?? resource.source ?? "manual"}`)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.aliases")}
                </dt>
                <dd className="mt-1 break-all font-medium text-foreground">
                  {resource.aliases?.join(", ") || t("common.notSet")}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  {t("common.fields.externalIdentifiers")}
                </dt>
                <dd className="mt-1 space-y-1 break-all font-mono text-xs text-foreground">
                  {resource.externalIdentifiers?.length
                    ? resource.externalIdentifiers.map((identifier) => (
                        <div key={`${identifier.system}:${identifier.value}`}>
                          {identifier.system}: {identifier.value}
                        </div>
                      ))
                    : t("common.notSet")}
                </dd>
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

          {resource.isArchived && (
            <DetailPanel title={t("archive.metadataTitle")} description="">
              <dl className="grid gap-3 text-sm md:grid-cols-3">
                <div>
                  <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {t("common.fields.archivedAt")}
                  </dt>
                  <dd className="mt-1 font-medium text-foreground">
                    {resource.archivedAt
                      ? formatDateTime(resource.archivedAt, locale as never)
                      : t("common.notSet")}
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

          {completeness && (
            <ResourceCompletenessPanel completeness={completeness} />
          )}

          <DetailPanel
            title={t("detailSheet.effectiveValues")}
            description={t("detailSheet.effectiveValuesDescription")}
          >
            {effectiveLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : effectiveEntries.length ? (
              <dl className="grid gap-3 md:grid-cols-2">
                {effectiveEntries.map(([key, entry]: [string, EffectiveValue]) => {
                  const fieldLabel = isOverrideField(key)
                    ? t(`detailSheet.effectiveFields.${key}`)
                    : formatLabel(key);
                  return (
                  <div key={key} className="rounded-lg border border-border bg-background px-3 py-3">
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {fieldLabel}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {entry.value == null ? t("common.notSet") : String(entry.value)}
                    </dd>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      {entry.provenance.kind === "manual_override"
                        ? t("detailSheet.manualOverride")
                        : t("detailSheet.observed")}
                      {entry.provenance.source ? ` · ${entry.provenance.source}` : ""}
                    </dd>
                    {isAdmin === true && isOverrideField(key) && (
                      <div className="mt-3 space-y-2">
                        <label
                          htmlFor={`override-${key}`}
                          className="text-xs font-medium text-foreground"
                        >
                          {t("detailSheet.overrideLabel", { field: fieldLabel })}
                        </label>
                        <Input
                          id={`override-${key}`}
                          value={overrideDraft[key] ?? ""}
                          onChange={(event) =>
                            setOverrideDraft((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                          disabled={overrideBusy !== null}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => saveOverride(key)}
                            disabled={overrideBusy !== null}
                            aria-label={
                              t("detailSheet.saveFieldOverride", {
                                field: fieldLabel,
                              })
                            }
                          >
                            {t("detailSheet.saveOverride")}
                          </Button>
                          {entry.provenance.kind === "manual_override" && (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => clearOverride(key)}
                              disabled={overrideBusy !== null}
                              aria-label={t("detailSheet.clearFieldOverride", {
                                field: fieldLabel,
                              })}
                            >
                              {t("detailSheet.clearOverride")}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t("common.notSet")}</p>
            )}
            {overrideError && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {overrideError}
              </p>
            )}
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
                  <div
                    key={key}
                    className="rounded-lg border border-border bg-background px-3 py-3"
                  >
                    <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      {t.has(`profileFields.${key}`) ? t(`profileFields.${key}`) : formatLabel(key)}
                    </dt>
                    <dd className="mt-1 text-sm font-medium text-foreground">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("common.notSet")}
              </p>
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
            title={t("topology.title")}
            description={t("topology.description")}
          >
            <TopologyPanel
              key={`${resource.id}:${resource.isArchived}`}
              resourceId={resource.id}
              compact
            />
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
        </div>
      </SheetContent>

      <EditResourceSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        resource={detailResource}
      />
    </Sheet>
  );
}
