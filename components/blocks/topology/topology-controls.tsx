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
  expanded: boolean;
  hasEdges: boolean;
  onDepthChange: (v: 1 | 2) => void;
  onDirectionChange: (v: string) => void;
  onExpandedChange: (v: boolean) => void;
};

export function TopologyControls({
  depth,
  direction,
  expanded,
  hasEdges,
  onDepthChange,
  onDirectionChange,
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
