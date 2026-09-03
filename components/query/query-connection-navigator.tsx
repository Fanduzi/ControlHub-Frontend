// input: query target page, client filters, search failure/retry state, and navigator callbacks
// output: grouped connection target navigator with localized loaded/total paging and error presentation
// pos: connection navigator filtering and grouping boundary
// note: if this file changes, update header and components/query/README.md
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
  searchError?: boolean;
  onRetrySearch?: () => void;
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
  searchError,
  onRetrySearch,
  searchInputRef,
}: QueryConnectionNavigatorProps) {
  const t = useTranslations("queryWorkbench");
  const common = useTranslations("common");
  const activeTarget = useMemo(
    () => targets.find((target) => target.resourceId === activeTargetId) ?? null,
    [targets, activeTargetId],
  );
  const filteredTargets = useMemo(
    () =>
      filterTargets(
        targets,
        searchError ? { ...filters, q: "", engine: "" } : filters,
      ),
    [filters, searchError, targets],
  );
  const groupedTargets = useMemo(
    () => groupTargetsByEnvironmentAndCluster(filteredTargets, common("unknown")),
    [common, filteredTargets],
  );

  const pageInfoLabel = useMemo(
    () =>
      t("connectionNavigator.showing", {
        loaded: filteredTargets.length,
        total: pageInfo.totalItems,
      }),
    [filteredTargets.length, pageInfo.totalItems, t],
  );

  return (
    <NavigatorBody
      activeTarget={activeTarget}
      filters={filters}
      groupedTargets={groupedTargets}
      engines={engines}
      pageInfo={pageInfoLabel}
      canLoadMore={pageInfo.hasNextPage && !searchError}
      loadingMore={loadingMore}
      onFilterChange={onFilterChange}
      onSelect={onSelect}
      onLoadMore={onLoadMore}
      onLoadAllEngines={onLoadAllEngines}
      loadingEngines={loadingEngines}
      targetLoadError={targetLoadError}
      searchError={searchError}
      onRetrySearch={onRetrySearch}
      searchInputRef={searchInputRef}
    />
  );
}
