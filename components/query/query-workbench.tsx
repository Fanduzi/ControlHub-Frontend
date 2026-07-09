"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  EMPTY_FILTERS,
  collectEngines,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { QueryConnectionNavigator } from "@/components/query/query-connection-navigator";
import { QuerySchemaBrowser } from "@/components/query/query-schema-browser";
import { QueryEditorShell } from "@/components/query/query-editor-shell";
import { QueryGovernancePanel } from "@/components/query/query-governance-panel";

type QueryWorkbenchProps = {
  targets: QueryTarget[];
  initialFilters?: WorkbenchFilters;
};

export function QueryWorkbench({
  targets,
  initialFilters = EMPTY_FILTERS,
}: QueryWorkbenchProps) {
  const t = useTranslations("queryWorkbench");
  const [filters, setFilters] = useState<WorkbenchFilters>(initialFilters);
  const [activeTargetId, setActiveTargetId] = useState<number | null>(
    targets[0]?.resourceId ?? null,
  );
  const [targetSelectionVersion, setTargetSelectionVersion] = useState(0);

  const engines = useMemo(() => collectEngines(targets), [targets]);

  // Resolve activeTarget from full targets array, not filteredTargets.
  // Filter only affects the navigator list, not the current worksheet target.
  const activeTarget =
    targets.find((target) => target.resourceId === activeTargetId) ??
    targets[0] ??
    null;

  function updateFilter(patch: Partial<WorkbenchFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
  }

  /** Navigator-originated target change: increment version so the editor can detect it. */
  function setActiveTargetFromNavigator(resourceId: number) {
    setActiveTargetId(resourceId);
    setTargetSelectionVersion((version) => version + 1);
  }

  /** Worksheet-originated target change: no version increment. */
  function setActiveTargetFromWorksheet(resourceId: number) {
    setActiveTargetId(resourceId);
  }

  return (
    <div className="space-y-4">
      <SafetyBanner />

      {activeTarget ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <div className="flex flex-col gap-4">
            <QueryConnectionNavigator
              targets={targets}
              activeTargetId={activeTargetId}
              filters={filters}
              engines={engines}
              onSelect={setActiveTargetFromNavigator}
              onFilterChange={updateFilter}
            />
            <QuerySchemaBrowser target={activeTarget} />
          </div>
          <QueryEditorShell
            targets={targets}
            activeTarget={activeTarget}
            targetSelectionVersion={targetSelectionVersion}
            onActiveTargetChange={setActiveTargetFromWorksheet}
          />
          <QueryGovernancePanel target={activeTarget} />
        </div>
      ) : (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}
    </div>
  );
}

function SafetyBanner() {
  const t = useTranslations("queryWorkbench");
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
    >
      <TriangleAlert
        className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden
      />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          {t("banner.title")}
        </p>
        <p className="text-sm text-muted-foreground">{t("banner.description")}</p>
      </div>
    </div>
  );
}
