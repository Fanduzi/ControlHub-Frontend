"use client";

import { type RefObject, useMemo } from "react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import {
  filterTargets,
  groupTargetsByEnvironmentAndCluster,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { NavigatorBody } from "@/components/query/query-connection-navigator-body";

export type QueryConnectionNavigatorProps = {
  targets: QueryTarget[];
  activeTargetId: number | null;
  filters: WorkbenchFilters;
  engines: string[];
  pageInfo: PageInfo;
  onSelect: (resourceId: number) => void;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

export function QueryConnectionNavigator({
  targets,
  activeTargetId,
  filters,
  engines,
  pageInfo,
  onSelect,
  onFilterChange,
  searchInputRef,
}: QueryConnectionNavigatorProps) {
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

  return (
    <NavigatorBody
      activeTarget={activeTarget}
      filters={filters}
      groupedTargets={groupedTargets}
      engines={engines}
      pageInfo={pageInfoLabel}
      onFilterChange={onFilterChange}
      onSelect={onSelect}
      searchInputRef={searchInputRef}
    />
  );
}
