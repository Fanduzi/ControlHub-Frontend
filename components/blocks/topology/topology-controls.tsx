"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TopologyControlsProps = {
  depth: 1 | 2;
  direction: string;
  relationType?: string;
  expanded: boolean;
  hasEdges: boolean;
  onDepthChange: (v: 1 | 2) => void;
  onDirectionChange: (v: string) => void;
  onRelationTypeChange: (v: string) => void;
  onExpandedChange: (v: boolean) => void;
};

export const TOPOLOGY_RELATION_TYPES = [
  "depends_on",
  "member_of",
  "runs_on",
  "points_to",
  "fronts",
  "manages",
  "replicates_to",
] as const;

export function TopologyControls({
  depth,
  direction,
  relationType,
  expanded,
  hasEdges,
  onDepthChange,
  onDirectionChange,
  onRelationTypeChange,
  onExpandedChange,
}: TopologyControlsProps) {
  const t = useTranslations();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("topology.depthLabel")}
        </span>
        <Select
          value={String(depth)}
          onValueChange={(v) => { if (v) onDepthChange(Number(v) as 1 | 2); }}
        >
          <SelectTrigger size="sm" data-testid="topology-depth-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1" data-testid="topology-depth-1">
              1
            </SelectItem>
            <SelectItem value="2" data-testid="topology-depth-2">
              2
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("topology.directionLabel")}
        </span>
        <Select
          value={direction ?? "both"}
          onValueChange={(v) => { if (v) onDirectionChange(v); }}
        >
          <SelectTrigger size="sm" data-testid="topology-direction-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both" data-testid="topology-direction-both">
              {t("topology.directionBoth")}
            </SelectItem>
            <SelectItem value="upstream" data-testid="topology-direction-upstream">
              {t("topology.directionUpstream")}
            </SelectItem>
            <SelectItem
              value="downstream"
              data-testid="topology-direction-downstream"
            >
              {t("topology.directionDownstream")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {t("topology.relationTypeLabel")}
        </span>
        <Select
          value={relationType || "all"}
          onValueChange={(v) => onRelationTypeChange(v || "all")}
        >
          <SelectTrigger size="sm" data-testid="topology-relation-type-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" data-testid="topology-relation-type-all">
              {t("topology.relationTypeAll")}
            </SelectItem>
            {TOPOLOGY_RELATION_TYPES.map((value) => (
              <SelectItem
                key={value}
                value={value}
                data-testid={`topology-relation-type-${value}`}
              >
                {t(`topology.relationTypes.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {!expanded && hasEdges && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onExpandedChange(true)}
          data-testid="topology-expand-button"
        >
          {t("topology.expandButton")}
        </Button>
      )}
    </div>
  );
}
