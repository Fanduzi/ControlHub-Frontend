"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/blocks/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createResourceRelation, deleteResourceRelation } from "@/services/resources";
import { listRelationTypes } from "@/services/settings";
import { formatLabel } from "@/lib/format";
import type { ResourceRelationViewModel } from "@/types/view-models";
import type { RelationTypeDefinition } from "@/types/settings";

type ResourceRelationPanelProps = {
  relations: ResourceRelationViewModel[];
  emptyTitle?: string;
  emptyDescription?: string;
  resourceId?: string;
};

export function ResourceRelationPanel({
  relations,
  emptyTitle,
  emptyDescription,
  resourceId,
}: ResourceRelationPanelProps) {
  const t = useTranslations("relations");
  const mt = useTranslations("mutations");
  const router = useRouter();

  const [showAddForm, setShowAddForm] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [relationType, setRelationType] = useState("");
  const [relationTypes, setRelationTypes] = useState<RelationTypeDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listRelationTypes().catch(() => []).then(setRelationTypes);
  }, []);

  const handleAddRelation = useCallback(async () => {
    if (!resourceId || !targetId || !relationType) return;

    setSubmitting(true);
    setError(null);

    try {
      await createResourceRelation(resourceId, {
        toResourceId: targetId,
        relationType,
      });
      router.refresh();
      setShowAddForm(false);
      setTargetId("");
      setRelationType("");
    } catch (err) {
      if (err instanceof Error) {
        const msg = err.message;
        if (msg.includes("409")) {
          setError(mt("errors.relationConflict"));
        } else if (msg.includes("404")) {
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
  }, [resourceId, targetId, relationType, router, mt]);

  const handleDeleteRelation = useCallback(
    async (relationId: string) => {
      setDeletingId(relationId);
      setError(null);

      try {
        await deleteResourceRelation(relationId);
        router.refresh();
      } catch (err) {
        if (err instanceof Error) {
          const msg = err.message;
          if (msg.includes("404")) {
            setError(mt("errors.notFound"));
          } else {
            setError(mt("errors.backend"));
          }
        } else {
          setError(mt("errors.unknown"));
        }
      } finally {
        setDeletingId(null);
      }
    },
    [router, mt],
  );

  return (
    <div className="space-y-3">
      {resourceId && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowAddForm((prev) => !prev)}
          >
            {showAddForm
              ? t("cancelAdd")
              : mt("relation.addTitle")}
          </Button>
        </div>
      )}

      {showAddForm && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {mt("relation.targetLabel")}
            </label>
            <Input
              value={targetId}
              onChange={(e) => {
                setTargetId(e.target.value);
                setError(null);
              }}
              placeholder={mt("relation.targetPlaceholder")}
              className="h-8 border-border bg-background text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {mt("relation.typeLabel")}
            </label>
            <Select value={relationType} onValueChange={(v) => { if (v !== null) setRelationType(v); }}>
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
          <div className="flex justify-end">
            <Button
              size="xs"
              onClick={handleAddRelation}
              disabled={submitting || !targetId || !relationType}
            >
              {submitting ? mt("relation.submitting") : mt("relation.addTitle")}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {!relations.length && !showAddForm ? (
        <EmptyState
          title={emptyTitle ?? t("emptyTitle")}
          description={emptyDescription ?? t("emptyDescription")}
        />
      ) : (
        relations.map((relation) => (
          <div
            key={relation.id}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {relation.relatedResourceName}
              </p>
              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {formatLabel(relation.relationType)} · {relation.direction}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-muted-foreground">
                {relation.relatedResourceId}
              </p>
              {resourceId && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleDeleteRelation(relation.id)}
                  disabled={deletingId === relation.id}
                  aria-label={mt("relation.confirmDelete")}
                >
                  ×
                </Button>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
