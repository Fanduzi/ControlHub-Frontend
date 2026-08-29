// input: React, root/namespace next-intl, next/navigation, auth-role, and server relation services
// output: localized relation rows, explicit directed relation creation, resilient successful-delete removal, refresh, and controlled errors
// pos: shared relation read/mutation surface that validates server-owned rules at the selected source-to-target boundary
// note: if this file changes, update this header and components/blocks/README.md.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { ApiError } from "@/services/api-client";

import { useAdminRole } from "@/lib/auth-role";
import { DbTypeIcon } from "@/components/blocks/db-type-icon";
import { EmptyState } from "@/components/blocks/empty-state";
import { ResourceSearchCombobox } from "@/components/blocks/resource-search-combobox";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createResourceRelation,
  deleteResourceRelation,
  getResourceRelationRules,
} from "@/services/resources";
import { listRelationTypes } from "@/services/settings";
import { localizeResourceType, localizeRelationType } from "@/lib/resource-summary";
import type { ResourceRelationViewModel } from "@/types/view-models";
import type { RelationTypeDefinition } from "@/types/settings";
import type { RelationshipRule, Resource, ResourceType } from "@/types/resource";

type RelationDirection = "outgoing" | "incoming";

type ResourceRelationPanelProps = {
  relations: ResourceRelationViewModel[];
  emptyTitle?: string;
  emptyDescription?: string;
  resourceId?: number;
  resourceType?: ResourceType;
  environmentId?: number;
};

export function ResourceRelationPanel({
  relations,
  emptyTitle,
  emptyDescription,
  resourceId,
  resourceType,
  environmentId,
}: ResourceRelationPanelProps) {
  const t = useTranslations();
  const rt = useTranslations("relations");
  const mt = useTranslations("mutations");
  const ct = useTranslations("common");
  const router = useRouter();
  const isAdmin = useAdminRole();

  const [showAddForm, setShowAddForm] = useState(false);
  const [target, setTarget] = useState<Resource | null>(null);
  const [relationType, setRelationType] = useState("");
  const [direction, setDirection] = useState<RelationDirection>("outgoing");
  const [relationTypes, setRelationTypes] = useState<RelationTypeDefinition[]>([]);
  const [relationRules, setRelationRules] = useState<RelationshipRule[]>([]);
  const [sourceEnvironmentId, setSourceEnvironmentId] = useState<number>();
  const [selectedSourceRules, setSelectedSourceRules] = useState<RelationshipRule[]>([]);
  const [selectedSourceEnvironmentId, setSelectedSourceEnvironmentId] = useState<number>();
  const [loadingSelectedSourceRules, setLoadingSelectedSourceRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const deletingIdsRef = useRef(new Set<number>());
  const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set());
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletedRelationIds, setDeletedRelationIds] = useState<Set<number>>(new Set());
  const visibleRelations = relations.filter((relation) => !deletedRelationIds.has(relation.id));

  useEffect(() => {
    if (!resourceId || isAdmin !== true) return;
    Promise.all([listRelationTypes(), getResourceRelationRules(resourceId)])
      .then(([definitions, response]) => {
        const allowed = new Set(response.rules.map((rule) => rule.relationType));
        setRelationTypes(resourceType ? definitions : definitions.filter((definition) => allowed.has(definition.key)));
        setRelationRules(response.rules);
        setSourceEnvironmentId(response.sourceEnvironmentId);
      })
      .catch(() => setError(mt("errors.backend")));
  }, [resourceId, resourceType, isAdmin, mt]);

  useEffect(() => {
    if (direction !== "incoming" || !target) {
      setSelectedSourceRules([]);
      setSelectedSourceEnvironmentId(undefined);
      setLoadingSelectedSourceRules(false);
      return;
    }

    let current = true;
    setLoadingSelectedSourceRules(true);
    getResourceRelationRules(target.id)
      .then((response) => {
        if (!current) return;
        setSelectedSourceRules(response.rules);
        setSelectedSourceEnvironmentId(response.sourceEnvironmentId);
      })
      .catch(() => {
        if (current) setError(mt("errors.backend"));
      })
      .finally(() => {
        if (current) setLoadingSelectedSourceRules(false);
      });

    return () => {
      current = false;
    };
  }, [direction, target, mt]);

  const selectedRule = (direction === "outgoing" ? relationRules : selectedSourceRules).find(
    (rule) => rule.relationType === relationType,
  );
  const targetResourceType = direction === "outgoing" ? target?.resourceType : resourceType;
  const sourceEnvironment = direction === "outgoing"
    ? sourceEnvironmentId
    : selectedSourceEnvironmentId;
  const targetEnvironment = direction === "outgoing"
    ? target?.environmentId
    : environmentId;
  const selectedBoundaryIsValid = Boolean(
    target &&
      selectedRule &&
      targetResourceType &&
      selectedRule.targetResourceTypes.includes(targetResourceType) &&
      (!selectedRule.sameEnvironment ||
        (sourceEnvironment !== undefined && sourceEnvironment === targetEnvironment)),
  );
  const isInvalidSelectedBoundary = Boolean(
    target &&
      relationType &&
      !loadingSelectedSourceRules &&
      !selectedBoundaryIsValid,
  );

  const handleAddRelation = useCallback(async () => {
    if (!resourceId || !target || !relationType) return;

    if (!selectedBoundaryIsValid) {
      setError(mt("errors.relationRejected"));
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const sourceId = direction === "outgoing" ? resourceId : target.id;
      const toResourceId = direction === "outgoing" ? target.id : resourceId;
      await createResourceRelation(sourceId, {
        toResourceId,
        relationType,
      });
      router.refresh();
      setShowAddForm(false);
      setTarget(null);
      setRelationType("");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "validation_failed") {
          setError(mt("errors.relationRejected"));
        } else if (err.status === 409) {
          setError(mt("errors.relationConflict"));
        } else if (err.status === 404) {
          setError(mt("errors.notFound"));
        } else {
          setError(mt("errors.backend"));
        }
      } else {
        setError(mt("errors.unknown"));
      }
    } finally {
      setSubmitting(false);
    }
  }, [resourceId, target, relationType, direction, selectedBoundaryIsValid, router, mt]);

  const handleDeleteRelation = useCallback(
    async (relationId: number) => {
      if (deletingIdsRef.current.has(relationId)) return;

      const nextDeletingIds = new Set(deletingIdsRef.current).add(relationId);
      deletingIdsRef.current = nextDeletingIds;
      setDeletingIds(nextDeletingIds);
      setError(null);
      setSuccess(null);

      try {
        await deleteResourceRelation(relationId);
        setDeletedRelationIds((current) => new Set(current).add(relationId));
        setSuccess(mt("relation.deleteSuccess"));
        router.refresh();
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError(mt("errors.notFound"));
          } else {
            setError(mt("errors.backend"));
          }
        } else {
          setError(mt("errors.unknown"));
        }
      } finally {
        const remainingDeletingIds = new Set(deletingIdsRef.current);
        remainingDeletingIds.delete(relationId);
        deletingIdsRef.current = remainingDeletingIds;
        setDeletingIds(remainingDeletingIds);
      }
    },
    [router, mt],
  );

  return (
    <div className="space-y-3">
      {resourceId && isAdmin === true && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm
              ? rt("cancelAdd")
              : mt("relation.addTitle")}
          </Button>
        </div>
      )}

      {showAddForm && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <fieldset>
              <legend className="mb-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {mt("relation.directionLabel")}
              </legend>
              <div className="flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="relation-direction"
                    checked={direction === "outgoing"}
                    onChange={() => {
                      setDirection("outgoing");
                      setTarget(null);
                      setError(null);
                    }}
                  />
                  {mt("relation.directionOutgoing")}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="relation-direction"
                    checked={direction === "incoming"}
                    onChange={() => {
                      setDirection("incoming");
                      setTarget(null);
                      setError(null);
                    }}
                    disabled={!resourceType || !environmentId}
                  />
                  {mt("relation.directionIncoming")}
                </label>
              </div>
            </fieldset>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {mt("relation.typeLabel")}
            </label>
            <Select value={relationType} onValueChange={(v) => {
              if (v !== null) {
                setRelationType(v);
                setDirection(
                  resourceType === "database_cluster" &&
                    ["member_of", "fronts", "points_to"].includes(v)
                    ? "incoming"
                    : "outgoing",
                );
                setTarget(null);
                setError(null);
              }
            }}>
              <SelectTrigger className="h-8 w-full border-border bg-background text-sm">
                <SelectValue placeholder={mt("relation.typePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {relationTypes.map((rt) => (
                  <SelectItem key={rt.key} value={rt.key}>
                    {rt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {mt("relation.targetLabel")}
            </label>
            <ResourceSearchCombobox
              key={`${direction}-${relationType}`}
              onSelect={(resource) => {
                setTarget(resource);
                setError(null);
              }}
              excludeIds={resourceId ? [resourceId] : []}
              resourceTypes={direction === "outgoing" ? selectedRule?.targetResourceTypes : undefined}
              environmentId={direction === "outgoing" && selectedRule?.sameEnvironment ? sourceEnvironmentId : undefined}
              disabled={direction === "outgoing" ? !selectedRule : !relationType || !resourceType || !environmentId}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="xs"
              onClick={handleAddRelation}
              disabled={submitting || !selectedBoundaryIsValid}
            >
              {submitting ? mt("relation.submitting") : mt("relation.addTitle")}
            </Button>
          </div>
        </div>
      )}

      {(error || isInvalidSelectedBoundary) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error ?? mt("errors.relationRejected")}
        </div>
      )}

      {success && <div role="status" aria-live="polite">{success}</div>}

      {!visibleRelations.length && !showAddForm ? (
        <EmptyState
          title={emptyTitle ?? rt("emptyTitle")}
          description={emptyDescription ?? rt("emptyDescription")}
        />
      ) : (
        visibleRelations.map((relation) => {
          const related = relation.relatedResource;
          const displayName = related?.displayName ?? relation.relatedResourceName;

          return (
            <div
              key={relation.id}
              className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3"
            >
              <div>
                {related ? (
                  <Link
                    href={`/resources/${related.id}`}
                    className="text-sm font-medium text-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-ring/50"
                  >
                    {displayName}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-foreground">
                    {displayName}
                  </span>
                )}
                <p className="mt-1 flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  <span>{localizeRelationType(relation.relationType, t)} &middot; {t(`relations.direction${relation.direction === "incoming" ? "Incoming" : "Outgoing"}`)}</span>
                  {related && (
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium lowercase tracking-normal text-muted-foreground">
                      {(related.resourceType === "database_instance" ||
                        related.resourceType === "database_cluster" ||
                        related.resourceType === "database_proxy") && (
                        <DbTypeIcon subtype={related.resourceSubtype} className="size-3.5" />
                      )}
                      {localizeResourceType(related.resourceType, t)}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {resourceId && isAdmin === true && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setPendingDeleteId(relation.id)}
                    disabled={deletingIds.has(relation.id)}
                    aria-label={mt("relation.confirmDelete")}
                  >
                    <X className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })
      )}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mt("relation.confirmDelete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {mt("relation.deleteConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ct("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDeleteId !== null) handleDeleteRelation(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              {ct("actions.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
