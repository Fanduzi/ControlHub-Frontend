// input: grouped query targets, active target, selection callback, and empty-state policy
// output: accessible environment/cluster target groups and target buttons
// pos: connection navigator target-list rendering seam
// note: if this file changes, update header and components/query/README.md
"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import {
  formatHostPortLabel,
  readinessLabelKey,
  type TargetGroup,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";

type ConnectionTargetGroupsProps = {
  activeTarget: QueryTarget | null;
  groups: TargetGroup[];
  onSelect: (resourceId: number) => void;
  suppressEmptyState?: boolean;
};

export function ConnectionTargetGroups({
  activeTarget,
  groups,
  onSelect,
  suppressEmptyState = false,
}: ConnectionTargetGroupsProps) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <div key={group.environment} role="group" aria-label={group.environment}>
          <h3 className="px-1 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {group.environment}
          </h3>
          {group.clusters.map((cluster) => (
            <div key={cluster.clusterName ?? "__none__"}>
              {cluster.clusterName && (
                <h4 className="px-1 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {cluster.clusterName}
                </h4>
              )}
              <ul className="flex flex-col gap-0.5">
                {cluster.targets.map((target) => (
                  <ConnectionTargetItem
                    key={target.resourceId}
                    activeTarget={activeTarget}
                    target={target}
                    onSelect={onSelect}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      {groups.length === 0 && !suppressEmptyState && (
        <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          {t("connectionNavigator.noMatches")}
        </div>
      )}
    </div>
  );
}

function ConnectionTargetItem({
  activeTarget,
  target,
  onSelect,
}: {
  activeTarget: QueryTarget | null;
  target: QueryTarget;
  onSelect: (resourceId: number) => void;
}) {
  const t = useTranslations("queryWorkbench");
  const isActive = activeTarget?.resourceId === target.resourceId;
  const isReady = target.readiness === "ready";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(target.resourceId)}
        aria-current={isActive ? "true" : undefined}
        aria-label={target.displayName}
        className={cn(
          "flex w-full flex-col items-start gap-0.5 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
          isActive && "border-primary bg-primary/10",
          isReady && "border-l-2 border-l-green-500 pl-[calc(0.5rem-2px)]",
        )}
      >
        <div className="flex w-full items-center gap-2">
          <span className="flex-1 truncate font-medium text-foreground">
            {target.displayName}
          </span>
          {isActive && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          {isReady && (
            <Badge
              variant="secondary"
              className="h-4 border-green-500/30 px-1 py-0 text-[10px] text-green-700 dark:text-green-300"
            >
              {t("connectionNavigator.ready")}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          <span>{target.connectionContext.engine}</span>
          <span className="text-border">·</span>
          <span>{target.connectionContext.environment}</span>
          <HostPortSnippet target={target} />
          <span className="text-border">·</span>
          <span
            className={cn(
              isReady
                ? "text-green-600 dark:text-green-400"
                : "text-amber-600 dark:text-amber-400",
            )}
          >
            {t(readinessLabelKey(target.readiness))}
          </span>
        </div>
      </button>
    </li>
  );
}

function HostPortSnippet({ target }: { target: QueryTarget }) {
  const t = useTranslations("queryWorkbench");
  const label = formatHostPortLabel(
    target.connectionContext.host,
    target.connectionContext.port,
    t("connection.incomplete"),
  );

  if (label === t("connection.incomplete")) return null;

  return (
    <>
      <span className="text-border">·</span>
      <span className="font-mono">{label}</span>
    </>
  );
}
