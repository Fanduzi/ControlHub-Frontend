"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  EMPTY_FILTERS,
  collectEngines,
  isAllFilter,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { QuerySchemaBrowser } from "@/components/query/query-schema-browser";
import { QueryEditorShell } from "@/components/query/query-editor-shell";
import { QueryWorkbenchNavigator } from "@/components/query/query-workbench-navigator";
import { ActiveConnectionSummary } from "@/components/query/query-connection-navigator-body";
import { getQueryTargets } from "@/services/query-targets";
import { QuerySchemaStore } from "@/lib/query-schema-store";

type QueryWorkbenchProps = {
  targets: QueryTarget[];
  pageInfo: PageInfo;
  initialFilters?: WorkbenchFilters;
  initialActiveTargetId?: number | null;
};

const SEARCH_DEBOUNCE_MS = 275;

type SearchResult = {
  readonly query: string;
  readonly items: QueryTarget[];
};

function getInitialActiveTargetId(targets: QueryTarget[]): number | null {
  return (
    targets.find((target) => target.availableActions.run === true)?.resourceId ??
    targets[0]?.resourceId ??
    null
  );
}

export function QueryWorkbench({
  targets,
  pageInfo,
  initialFilters = EMPTY_FILTERS,
  initialActiveTargetId,
}: QueryWorkbenchProps) {
  const t = useTranslations("queryWorkbench");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<WorkbenchFilters>(initialFilters);
  const [targetCache, setTargetCache] = useState<Map<number, QueryTarget>>(() => new Map());
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<number | null>(
    initialActiveTargetId === undefined
      ? getInitialActiveTargetId(targets)
      : initialActiveTargetId,
  );
  const [targetSelectionVersion, setTargetSelectionVersion] = useState(0);
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null);
  const searchGeneration = useRef(0);
  const schemaStore = useMemo(() => new QuerySchemaStore(), []);

  useEffect(() => {
    const generation = searchGeneration.current + 1;
    searchGeneration.current = generation;
    const query = filters.q.trim();

    if (query.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void getQueryTargets(
        {
          page: 1,
          pageSize: 50,
          q: query,
          ...(!isAllFilter(filters.engine) && { engine: filters.engine }),
        },
        { signal: controller.signal },
      ).then(
        (response) => {
          if (controller.signal.aborted || generation !== searchGeneration.current) {
            return;
          }
          setSearchResult({ query, items: response.items });
        },
        () => {
          if (controller.signal.aborted || generation !== searchGeneration.current) {
            return;
          }
          setSearchResult({ query, items: [] });
        },
      );
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [filters.engine, filters.q]);

  const cachedTargets = useMemo(() => {
    const combined = new Map(targetCache);
    for (const target of targets) {
      combined.set(target.resourceId, target);
    }
    return Array.from(combined.values());
  }, [targetCache, targets]);
  const targetsById = useMemo(
    () => new Map(cachedTargets.map((target) => [target.resourceId, target])),
    [cachedTargets],
  );
  const query = filters.q.trim();
  const navigatorTargets = useMemo(() => {
    if (query.length === 0 || searchResult === null) {
      return targets;
    }
    return searchResult.query === query ? searchResult.items : [];
  }, [query, searchResult, targets]);
  const engines = useMemo(() => collectEngines(navigatorTargets), [navigatorTargets]);

  // Resolve activeTarget from full targets array, not filteredTargets.
  // Filter only affects the navigator list, not the current worksheet target.
  const activeTarget =
    activeTargetId === null ? null : targetsById.get(activeTargetId) ?? null;

  function updateFilter(patch: Partial<WorkbenchFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
  }

  /** Navigator-originated target change: increment version so the editor can detect it. */
  function setActiveTargetFromNavigator(resourceId: number) {
    const selectedTarget =
      targetsById.get(resourceId) ??
      searchResult?.items.find((target) => target.resourceId === resourceId);
    if (selectedTarget === undefined) {
      return;
    }
    if (!targetsById.has(resourceId)) {
      setTargetCache((previous) => new Map(previous).set(resourceId, selectedTarget));
    }
    setActiveTargetId(resourceId);
    setTargetSelectionVersion((version) => version + 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("targetId", String(resourceId));
    router.replace(`${pathname}?${params.toString()}`);
  }

  /** Worksheet-originated target change: no version increment. */
  function setActiveTargetFromWorksheet(resourceId: number) {
    if (!targetsById.has(resourceId)) {
      return;
    }
    setActiveTargetId(resourceId);
  }

  return (
    <div className="space-y-4">
      {activeTarget ? (
        <div data-testid="query-workbench-grid" className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <ActiveConnectionSummary target={activeTarget} />
            <QueryWorkbenchNavigator
              targets={navigatorTargets}
              activeTargetId={activeTargetId}
              filters={filters}
              engines={engines}
              pageInfo={pageInfo}
              onSelect={setActiveTargetFromNavigator}
              onFilterChange={updateFilter}
            />
          </div>
          <QueryEditorShell
            targets={cachedTargets}
            activeTarget={activeTarget}
            targetSelectionVersion={targetSelectionVersion}
            onActiveTargetChange={setActiveTargetFromWorksheet}
            onActiveDatabaseChange={setActiveDatabase}
          />
          <QuerySchemaBrowser target={activeTarget} store={schemaStore} activeDatabase={activeDatabase} />
        </div>
      ) : (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}
    </div>
  );
}
