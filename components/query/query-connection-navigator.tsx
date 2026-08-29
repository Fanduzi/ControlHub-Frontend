"use client";

import { type RefObject, useMemo } from "react";
import { useTranslations } from "next-intl";

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
  onLoadMore?: () => void;
  loadingMore?: boolean;
  onLoadAllEngines?: () => void;
  loadingEngines?: boolean;
  targetLoadError?: string | null;
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
  onLoadMore,
  loadingMore,
  onLoadAllEngines,
  loadingEngines,
  targetLoadError,
  searchInputRef,
}: QueryConnectionNavigatorProps) {
  const t = useTranslations("queryWorkbench");
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
    () => t("connectionNavigator.showing", { count: filteredTargets.length }),
    [filteredTargets.length, t],
  );

  return (
    <NavigatorBody
      activeTarget={activeTarget}
      filters={filters}
      groupedTargets={groupedTargets}
      engines={engines}
      pageInfo={pageInfoLabel}
      canLoadMore={pageInfo.hasNextPage}
      loadingMore={loadingMore}
      onFilterChange={onFilterChange}
      onSelect={onSelect}
      onLoadMore={onLoadMore}
      onLoadAllEngines={onLoadAllEngines}
      loadingEngines={loadingEngines}
      targetLoadError={targetLoadError}
      searchInputRef={searchInputRef}
    />
  );
}
