import type { ResourceRelationViewModel } from "@/types/view-models";

import { EmptyState } from "@/components/blocks/empty-state";
import { formatLabel } from "@/lib/format";

type ResourceRelationPanelProps = {
  relations: ResourceRelationViewModel[];
};

export function ResourceRelationPanel({
  relations,
}: ResourceRelationPanelProps) {
  if (!relations.length) {
    return (
      <EmptyState
        title="No linked resources"
        description="Use relations to capture containment, ownership, and service dependency context."
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
          <p className="text-xs text-muted-foreground">{relation.relatedResourceId}</p>
        </div>
      ))}
    </div>
  );
}
