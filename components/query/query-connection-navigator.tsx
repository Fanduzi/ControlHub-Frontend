"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import { Button } from "@/components/ui/button";
import {
  filterTargets,
  groupTargetsByEnvironmentAndCluster,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";
import { NavigatorBody } from "@/components/query/query-connection-navigator-body";

export type QueryConnectionNavigatorProps = {
  targets: QueryTarget[];
  activeTargetId: number | null;
  filters: WorkbenchFilters;
  engines: string[];
  pageInfo: PageInfo;
  onSelect: (resourceId: number) => void;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
};

export function QueryConnectionNavigator({
  targets,
  activeTargetId,
  filters,
  engines,
  pageInfo,
  onSelect,
  onFilterChange,
}: QueryConnectionNavigatorProps) {
  const t = useTranslations("queryWorkbench");
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeTarget = useMemo(
    () => targets.find((target) => target.resourceId === activeTargetId) ?? null,
    [targets, activeTargetId],
  );
  const filteredTargets = useMemo(
    () => filterTargets(targets, filters),
    [targets, filters],
  );
  const groupedTargets = useMemo(
    () => groupTargetsByEnvironmentAndCluster(filteredTargets),
    [filteredTargets],
  );

  const pageInfoLabel = useMemo(
    () => `Showing ${targets.length} loaded targets from ${pageInfo.totalItems} total`,
    [targets.length, pageInfo.totalItems],
  );

  function handleSelect(resourceId: number) {
    onSelect(resourceId);
    setMobileOpen(false);
  }

  const content = (
    <NavigatorBody
      activeTarget={activeTarget}
      filters={filters}
      groupedTargets={groupedTargets}
      engines={engines}
      pageInfo={pageInfoLabel}
      onFilterChange={onFilterChange}
      onSelect={handleSelect}
    />
  );

  return (
    <>
      <div className="xl:hidden space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          aria-expanded={mobileOpen}
          aria-controls="mobile-connection-navigator"
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span>{t("connectionNavigator.title")}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              mobileOpen && "rotate-180",
            )}
          />
        </Button>
        {mobileOpen && (
          <div
            id="mobile-connection-navigator"
            className="rounded-xl border border-border bg-card p-3"
            aria-label={t("connectionNavigator.title")}
          >
            {content}
          </div>
        )}
      </div>

      <aside
        className="hidden xl:flex flex-col gap-3 rounded-xl border border-border bg-card p-3"
        aria-label={t("connectionNavigator.title")}
      >
        <h2 className="font-heading text-sm font-semibold">
          {t("connectionNavigator.title")}
        </h2>
        {content}
      </aside>
    </>
  );
}
