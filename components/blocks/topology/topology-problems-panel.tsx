"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TopologyProblemSummary } from "@/types/resource";

type TopologyProblemsPanelProps = {
  problems: TopologyProblemSummary[];
  expanded: boolean;
  onToggle: () => void;
  onHighlightNode: (nodeId: number) => void;
};

export function TopologyProblemsPanel({
  problems,
  expanded,
  onToggle,
  onHighlightNode,
}: TopologyProblemsPanelProps) {
  const t = useTranslations();

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-xs"
        data-testid="topology-problems-toggle"
      >
        <span className="flex items-center gap-2 font-medium text-foreground">
          <AlertTriangle className="size-3.5 text-amber-500" />
          {t("topology.problemsTitle")} ({problems.length})
        </span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-1">
          {problems.map((p: TopologyProblemSummary) => (
            <div
              key={p.resourceId}
              className="flex items-center gap-2 text-xs py-1 cursor-pointer hover:bg-muted/50 rounded px-2"
              onClick={() => onHighlightNode(p.resourceId)}
              data-testid={`topology-problem-${p.resourceId}`}
            >
              <span className={cn("size-2 rounded-full shrink-0", p.severity === "critical" ? "bg-red-500" : "bg-amber-500")} aria-label={p.severity === "critical" ? t("topology.severityCritical") : t("topology.severityWarning")} role="img" />
              <span className="font-medium text-foreground">{p.resourceName}</span>
              <span className="text-muted-foreground truncate">
                {p.problems.map((pr) => {
                  const key = `topology.problemCodes.${pr.code}`;
                  return t.has(key) ? t(key) : t("topology.problemUnknown");
                }).join(", ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
