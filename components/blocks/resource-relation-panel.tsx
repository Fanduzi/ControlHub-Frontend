"use client";

import { useTranslations } from "next-intl";

import type { ResourceRelationViewModel } from "@/types/view-models";

import { EmptyState } from "@/components/blocks/empty-state";
import { formatLabel } from "@/lib/format";

type ResourceRelationPanelProps = {
  relations: ResourceRelationViewModel[];
  emptyTitle?: string;
  emptyDescription?: string;
};

export function ResourceRelationPanel({
  relations,
  emptyTitle,
  emptyDescription,
}: ResourceRelationPanelProps) {
  const t = useTranslations("relations");

  if (!relations.length) {
    return (
      <EmptyState
        title={emptyTitle ?? t("emptyTitle")}
        description={emptyDescription ?? t("emptyDescription")}
      />
    );
  }

  return (
    <div className="space-y-3">
      {relations.map((relation) => (
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
          <p className="font-mono text-xs text-muted-foreground">{relation.relatedResourceId}</p>
        </div>
      ))}
    </div>
  );
}
