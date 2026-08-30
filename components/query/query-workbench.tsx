// input: QueryWorkbench props, target/schema services, navigation, and messages
// output: scoped target search, exact persisted-target recovery, unavailable-target locking, and editor state
// pos: top-level query workbench and target-search generation boundary
// note: if this file changes, update header and components/query/README.md
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Database, ListTree, TriangleAlert, XCircle } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type { TablePreviewRequest } from "@/types/query-execution";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  EMPTY_FILTERS,
  collectEngines,
  isAllFilter,
  readinessLabelKey,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { QueryEditorShell } from "@/components/query/query-editor-shell";
import { QueryWorkbenchNavigator } from "@/components/query/query-workbench-navigator";
import { QueryObjectExplorer } from "@/components/query/query-object-explorer";
import { getQueryTargets } from "@/services/query-targets";
import { QuerySchemaStore } from "@/lib/query-schema-store";

/** Schema introspection requires a ready target with run permission. */
function canBrowseSchema(target: QueryTarget): boolean {
  return target.availableActions.run === true;
}

type QueryWorkbenchProps = {
  targets: QueryTarget[];
  pageInfo: PageInfo;
  initialFilters?: WorkbenchFilters;
  initialActiveTargetId?: number | null;
  environmentId?: number | null;
};

const SEARCH_DEBOUNCE_MS = 275;

type TargetSearchResult = {
  readonly key: string;
  readonly items: QueryTarget[];
  readonly pageInfo: PageInfo;
};

type TargetSearchError = {
  readonly key: string;
};

type ScopedTargetCache = {
  readonly environmentId: number | null | undefined;
  readonly items: Map<number, QueryTarget>;
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
  environmentId,
}: QueryWorkbenchProps) {
  const t = useTranslations("queryWorkbench");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<WorkbenchFilters>(initialFilters);
  const [targetCache, setTargetCache] = useState<ScopedTargetCache>(() => ({
    environmentId,
    items: new Map(),
  }));
  const [loadedTargets, setLoadedTargets] = useState<QueryTarget[]>(targets);
  const [loadedPageInfo, setLoadedPageInfo] = useState<PageInfo>(pageInfo);
  const [searchResult, setSearchResult] = useState<TargetSearchResult | null>(null);
  const [searchError, setSearchError] = useState<TargetSearchError | null>(null);
  const [searchRetryVersion, setSearchRetryVersion] = useState(0);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [allEngines, setAllEngines] = useState<string[] | null>(null);
  const [enginesLoading, setEnginesLoading] = useState(false);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);
  const [activeTargetId, setActiveTargetId] = useState<number | null>(
    initialActiveTargetId === undefined
      ? getInitialActiveTargetId(targets)
      : initialActiveTargetId,
  );
  const [targetSelectionVersion, setTargetSelectionVersion] = useState(0);
  const [activeDatabase, setActiveDatabase] = useState<string | null>(null);
  const searchGeneration = useRef(0);
  const exactTargetGeneration = useRef(0);
  const exactTargetController = useRef<AbortController | null>(null);
  const exactTargetAttempt = useRef<{
    readonly environmentId: number;
    readonly resourceId: number;
  } | null>(null);
  const schemaStore = useMemo(() => new QuerySchemaStore(), []);
  const previewGeneration = useRef(0);
  const [pendingPreviewEvent, setPendingPreviewEvent] = useState<{
    id: number;
    request: TablePreviewRequest;
  } | null>(null);

  useEffect(() => () => {
    exactTargetGeneration.current += 1;
    exactTargetController.current?.abort();
    exactTargetController.current = null;
  }, []);

  const OBJECTS_PANE_STORAGE_KEY = "query-objects-pane-open";
  const OBJECTS_WIDTH_STORAGE_KEY = "query-objects-pane-width";
  const MIN_OBJECTS_WIDTH = 260;
  const DEFAULT_OBJECTS_WIDTH = 320;
  const EDITOR_MIN_WIDTH = 480;
  const ABSOLUTE_MAX_OBJECTS_WIDTH = 560;

  function getMaxObjectsWidth(): number {
    if (typeof window === "undefined") return ABSOLUTE_MAX_OBJECTS_WIDTH;
    return Math.min(ABSOLUTE_MAX_OBJECTS_WIDTH, window.innerWidth - EDITOR_MIN_WIDTH);
  }

  const [objectsOpen, setObjectsOpen] = useState(false);
  const [objectsPaneWidth, setObjectsPaneWidth] = useState(DEFAULT_OBJECTS_WIDTH);
  const [isHydrated, setIsHydrated] = useState(false);
  const [mobileObjectsOpen, setMobileObjectsOpen] = useState(false);
  const mobileObjectsTriggerRef = useRef<HTMLButtonElement>(null);
  const objectsPaneWidthRef = useRef(objectsPaneWidth);

  useEffect(() => {
    const storedOpen = window.localStorage.getItem(OBJECTS_PANE_STORAGE_KEY) === "true";
    const rawWidth = window.localStorage.getItem(OBJECTS_WIDTH_STORAGE_KEY);
    const storedWidth = rawWidth !== null ? Number(rawWidth) : NaN;
    const max = getMaxObjectsWidth();
    const clampedWidth = Number.isFinite(storedWidth)
      ? Math.max(MIN_OBJECTS_WIDTH, Math.min(max, storedWidth))
      : DEFAULT_OBJECTS_WIDTH;

    // Hydration: read persisted preferences after mount (cannot read localStorage during SSR)
    setObjectsOpen(storedOpen);
    setObjectsPaneWidth(clampedWidth);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    objectsPaneWidthRef.current = objectsPaneWidth;
  }, [objectsPaneWidth]);

  useEffect(() => {
    if (isHydrated) {
      window.localStorage.setItem(OBJECTS_PANE_STORAGE_KEY, String(objectsOpen));
    }
  }, [objectsOpen, isHydrated]);

  function handleObjectsResizePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = objectsPaneWidthRef.current;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = Math.min(
        getMaxObjectsWidth(),
        Math.max(MIN_OBJECTS_WIDTH, startWidth + moveEvent.clientX - startX),
      );
      objectsPaneWidthRef.current = nextWidth;
      setObjectsPaneWidth(nextWidth);
    }

    function handlePointerUp() {
      window.localStorage.setItem(
        OBJECTS_WIDTH_STORAGE_KEY,
        String(objectsPaneWidthRef.current),
      );
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (activeTargetId) params.set("targetId", String(activeTargetId));
    if (activeDatabase) {
      params.set("database", activeDatabase);
    } else {
      params.delete("database");
    }

    const desired = `${pathname}?${params.toString()}`;
    const current = `${pathname}?${searchParams.toString()}`;

    if (desired !== current) {
      router.replace(desired);
    }
  }, [activeDatabase, activeTargetId, pathname, router, searchParams]);

  useEffect(() => {
    setLoadedTargets(targets);
    setLoadedPageInfo(pageInfo);
    setSearchResult(null);
    setSearchError(null);
    setAllEngines(null);
  }, [pageInfo, targets]);

  useEffect(() => {
    const generation = searchGeneration.current + 1;
    searchGeneration.current = generation;
    setSearchError(null);
    const query = filters.q.trim();
    const engine = isAllFilter(filters.engine) ? "" : filters.engine;
    const key = `${environmentId ?? ""}\u0000${query}\u0000${engine}`;

    if (
      (query.length === 0 && engine === "") ||
      environmentId === undefined ||
      environmentId === null
    ) {
      setSearchResult(null);
      setTargetsLoading(false);
      return;
    }

    const controller = new AbortController();
    const load = () => {
      setTargetsLoading(true);
      void getQueryTargets(
        {
          page: 1,
          pageSize: 50,
          ...(query && { q: query }),
          ...(environmentId !== undefined && { environmentId }),
          ...(engine && { engine }),
        },
        { signal: controller.signal },
      ).then(
        (response) => {
          if (controller.signal.aborted || generation !== searchGeneration.current) {
            return;
          }
          setSearchResult({ key, items: response.items, pageInfo: response.pageInfo });
          setSearchError(null);
          setTargetsLoading(false);
        },
        () => {
          if (controller.signal.aborted || generation !== searchGeneration.current) {
            return;
          }
          setSearchError({ key });
          setTargetsLoading(false);
        },
      );
    };

    const timeout = query
      ? window.setTimeout(load, SEARCH_DEBOUNCE_MS)
      : undefined;
    if (timeout === undefined) load();

    return () => {
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller.abort();
    };
  }, [environmentId, filters.engine, filters.q, searchRetryVersion]);

  const cachedTargets = useMemo(() => {
    const combined = new Map(
      targetCache.environmentId === environmentId
        ? targetCache.items
        : undefined,
    );
    for (const target of loadedTargets) {
      combined.set(target.resourceId, target);
    }
    return Array.from(combined.values());
  }, [environmentId, loadedTargets, targetCache]);
  const targetsById = useMemo(
    () => new Map(cachedTargets.map((target) => [target.resourceId, target])),
    [cachedTargets],
  );
  const query = filters.q.trim();
  const engine = isAllFilter(filters.engine) ? "" : filters.engine;
  const targetSearchKey = `${environmentId ?? ""}\u0000${query}\u0000${engine}`;
  const usesServerFilter = query.length > 0 || engine !== "";
  const hasCurrentSearchResult = searchResult?.key === targetSearchKey;
  const hasCurrentSearchError = searchError?.key === targetSearchKey;
  const visibleSearchResult =
    hasCurrentSearchResult || hasCurrentSearchError ? searchResult : null;
  const navigatorTargets = useMemo(() => {
    if (!usesServerFilter) {
      return loadedTargets;
    }
    return visibleSearchResult?.items ?? loadedTargets;
  }, [loadedTargets, usesServerFilter, visibleSearchResult]);
  const navigatorPageInfo =
    usesServerFilter && visibleSearchResult !== null
      ? visibleSearchResult.pageInfo
      : loadedPageInfo;
  const engines = useMemo(() => {
    const knownEngines = allEngines ?? collectEngines(loadedTargets);
    return engine && !knownEngines.includes(engine)
      ? [...knownEngines, engine].sort((left, right) => left.localeCompare(right))
      : knownEngines;
  }, [allEngines, engine, loadedTargets]);

  const activeTarget =
    activeTargetId === null ? null : targetsById.get(activeTargetId) ?? null;

  function updateFilter(patch: Partial<WorkbenchFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
    if (patch.engine === undefined) return;

    const params = new URLSearchParams(searchParams.toString());
    if (isAllFilter(patch.engine)) {
      params.delete("engine");
    } else {
      params.set("engine", patch.engine);
    }
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function loadMoreTargets() {
    if (
      !navigatorPageInfo.hasNextPage ||
      targetsLoading ||
      environmentId === undefined ||
      environmentId === null
    ) {
      return;
    }

    setTargetsLoading(true);
    setTargetLoadError(null);
    try {
      const response = await getQueryTargets({
        page: navigatorPageInfo.page + 1,
        pageSize: navigatorPageInfo.pageSize,
        ...(query && { q: query }),
        ...(environmentId !== undefined && { environmentId }),
        ...(engine && { engine }),
      });

      if (usesServerFilter) {
        setSearchResult((previous) =>
          previous?.key === targetSearchKey
            ? {
                key: targetSearchKey,
                items: [...previous.items, ...response.items],
                pageInfo: response.pageInfo,
              }
            : previous,
        );
      } else {
        setLoadedTargets((previous) => [...previous, ...response.items]);
        setLoadedPageInfo(response.pageInfo);
      }
    } catch {
      setTargetLoadError(t("connectionNavigator.targetLoadError"));
    } finally {
      setTargetsLoading(false);
    }
  }

  async function loadAllEngines() {
    if (environmentId === undefined || environmentId === null || enginesLoading) {
      return;
    }

    setEnginesLoading(true);
    setTargetLoadError(null);
    try {
      const allTargets: QueryTarget[] = [];
      let nextPage = 1;
      let hasNextPage = true;

      while (hasNextPage) {
        const response = await getQueryTargets({
          page: nextPage,
          pageSize: 50,
          environmentId,
        });
        allTargets.push(...response.items);
        hasNextPage = response.pageInfo.hasNextPage;
        nextPage += 1;
      }

      setAllEngines(collectEngines(allTargets));
    } catch {
      setTargetLoadError(t("connectionNavigator.targetLoadError"));
    } finally {
      setEnginesLoading(false);
    }
  }

  function retrySearch() {
    setSearchRetryVersion((version) => version + 1);
  }

  function setActiveTargetFromNavigator(resourceId: number) {
    exactTargetGeneration.current += 1;
    exactTargetController.current?.abort();
    exactTargetController.current = null;
    exactTargetAttempt.current = null;
    const selectedTarget =
      targetsById.get(resourceId) ??
      searchResult?.items.find((target) => target.resourceId === resourceId);
    if (selectedTarget === undefined) {
      return;
    }
    if (!targetsById.has(resourceId)) {
      setTargetCache((previous) => {
        const items = new Map(
          previous.environmentId === environmentId
            ? previous.items
            : undefined,
        );
        items.set(resourceId, selectedTarget);
        return { environmentId, items };
      });
    }
    setActiveTargetId(resourceId);
    setTargetSelectionVersion((version) => version + 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("targetId", String(resourceId));
    params.delete("database");
    router.replace(`${pathname}?${params.toString()}`);
  }

  const setActiveTargetFromWorksheet = useCallback((resourceId: number) => {
    const generation = exactTargetGeneration.current + 1;
    exactTargetGeneration.current = generation;
    exactTargetController.current?.abort();
    exactTargetController.current = null;

    if (targetsById.has(resourceId)) {
      exactTargetAttempt.current = null;
      setActiveTargetId(resourceId);
      return;
    }
    if (environmentId === undefined || environmentId === null) return;
    if (
      exactTargetAttempt.current?.environmentId === environmentId &&
      exactTargetAttempt.current.resourceId === resourceId
    ) {
      return;
    }
    exactTargetAttempt.current = { environmentId, resourceId };

    const controller = new AbortController();
    exactTargetController.current = controller;
    void getQueryTargets(
      { targetId: resourceId, environmentId },
      { signal: controller.signal },
    ).then(
      (response) => {
        if (
          controller.signal.aborted ||
          generation !== exactTargetGeneration.current
        ) {
          return;
        }
        exactTargetController.current = null;
        const exactTarget = response.items.find(
          (target) => target.resourceId === resourceId,
        );
        if (!exactTarget) return;
        setTargetCache((previous) => {
          const items = new Map(
            previous.environmentId === environmentId
              ? previous.items
              : undefined,
          );
          items.set(resourceId, exactTarget);
          return { environmentId, items };
        });
        setActiveTargetId(resourceId);
      },
      () => {
        if (exactTargetController.current === controller) {
          exactTargetController.current = null;
        }
        // Missing, unauthorized, and failed exact lookups remain unavailable.
      },
    );
  }, [environmentId, targetsById]);

  useEffect(() => {
    if (activeTargetId !== null && !targetsById.has(activeTargetId)) {
      setActiveTargetFromWorksheet(activeTargetId);
    }
  }, [activeTargetId, setActiveTargetFromWorksheet, targetsById]);

  function handlePreviewRequest(request: TablePreviewRequest) {
    previewGeneration.current += 1;
    setPendingPreviewEvent({ id: previewGeneration.current, request });
  }

  return (
    <div className="flex min-h-0 flex-col gap-0">
      {loadedTargets.length > 0 ? (
        <>
          <QueryContextBar
            target={activeTarget}
            activeDatabase={activeDatabase}
            navigatorTargets={navigatorTargets}
            activeTargetId={activeTargetId}
            filters={filters}
            engines={engines}
            pageInfo={navigatorPageInfo}
            onSelect={setActiveTargetFromNavigator}
            onFilterChange={updateFilter}
            onLoadMore={loadMoreTargets}
            loadingMore={targetsLoading}
            onLoadAllEngines={loadAllEngines}
            loadingEngines={enginesLoading}
            targetLoadError={targetLoadError}
            searchError={hasCurrentSearchError}
            onRetrySearch={retrySearch}
            objectsOpen={objectsOpen}
            onObjectsToggle={() => setObjectsOpen((prev) => !prev)}
            onMobileObjectsOpenChange={setMobileObjectsOpen}
            mobileObjectsTriggerRef={mobileObjectsTriggerRef}
          />
          {activeTarget ? (
            <div data-testid="query-workbench-grid" className="flex min-h-0 min-w-0 flex-1">
            {/* Desktop objects pane — only mount explorer when open so locked
                targets never issue unsolicited schema requests. */}
            {objectsOpen && (
              <>
                <aside
                  className="hidden shrink-0 border-r border-border bg-card overflow-y-auto lg:block"
                  style={{ width: objectsPaneWidth }}
                  aria-label={t("schema.objectsLabel")}
                >
                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {t("schema.objectsLabel")}
                    </span>
                    <button
                      type="button"
                      onClick={() => setObjectsOpen(false)}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={t("schema.closeObjects")}
                    >
                      <XCircle className="size-3.5" aria-hidden />
                    </button>
                  </div>
                  <div className="p-2">
                    {canBrowseSchema(activeTarget) ? (
                      <QueryObjectExplorer
                        targetId={activeTarget.resourceId}
                        store={schemaStore}
                        onPreviewRequest={handlePreviewRequest}
                      />
                    ) : (
                      <p className="p-2 text-sm text-muted-foreground">{t("schema.locked")}</p>
                    )}
                  </div>
                </aside>

                <button
                  type="button"
                  role="separator"
                  aria-orientation="vertical"
                  aria-valuemin={MIN_OBJECTS_WIDTH}
                  aria-valuemax={getMaxObjectsWidth()}
                  aria-valuenow={objectsPaneWidth}
                  aria-label={t("schema.resizeObjects")}
                  tabIndex={0}
                  onPointerDown={handleObjectsResizePointerDown}
                  onKeyDown={(e) => {
                    const step = e.shiftKey ? 20 : 10;
                    if (e.key === "ArrowLeft") {
                      setObjectsPaneWidth((prev) => Math.max(MIN_OBJECTS_WIDTH, prev - step));
                    } else if (e.key === "ArrowRight") {
                      setObjectsPaneWidth((prev) => Math.min(getMaxObjectsWidth(), prev + step));
                    }
                  }}
                  className="hidden w-1.5 cursor-col-resize items-center justify-center bg-muted/30 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:flex"
                >
                  <span className="h-8 w-0.5 rounded-full bg-border" aria-hidden />
                </button>
              </>
            )}

            {/* Mobile Object Explorer Sheet — bottom drawer; editor stays primary. */}
            <Sheet open={mobileObjectsOpen} onOpenChange={setMobileObjectsOpen}>
              <SheetContent
                side="bottom"
                className="max-h-[85dvh] overflow-y-auto"
                showCloseButton={false}
                finalFocus={mobileObjectsTriggerRef}
              >
                <SheetHeader className="flex flex-row items-start justify-between gap-2 pr-2">
                  <SheetTitle>{t("schema.title")}</SheetTitle>
                  <button
                    type="button"
                    onClick={() => setMobileObjectsOpen(false)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                    aria-label={t("schema.closeObjects")}
                  >
                    <XCircle className="size-4" aria-hidden />
                  </button>
                </SheetHeader>
                <div className="min-w-0 px-4 pb-4">
                  {canBrowseSchema(activeTarget) ? (
                    <QueryObjectExplorer
                      targetId={activeTarget.resourceId}
                      store={schemaStore}
                      onPreviewRequest={handlePreviewRequest}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("schema.locked")}</p>
                  )}
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0 flex-1">
              <QueryEditorShell
                targets={cachedTargets}
                activeTarget={activeTarget}
                targetSelectionVersion={targetSelectionVersion}
                onActiveTargetChange={setActiveTargetFromWorksheet}
                onActiveDatabaseChange={setActiveDatabase}
                schemaStore={schemaStore}
                pendingPreviewEvent={pendingPreviewEvent}
                onPreviewConsumed={() => setPendingPreviewEvent(null)}
              />
            </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-8 text-center">
              <div>
                <p className="text-sm font-medium text-foreground">{t("unavailableTarget.title")}</p>
                <p className="mt-1 text-sm text-muted-foreground">{t("unavailableTarget.description")}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}
    </div>
  );
}

type QueryContextBarProps = {
  target: QueryTarget | null;
  activeDatabase: string | null;
  navigatorTargets: QueryTarget[];
  activeTargetId: number | null;
  filters: WorkbenchFilters;
  engines: string[];
  pageInfo: PageInfo;
  onSelect: (resourceId: number) => void;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
  onLoadMore: () => void;
  loadingMore: boolean;
  onLoadAllEngines: () => void;
  loadingEngines: boolean;
  targetLoadError: string | null;
  searchError: boolean;
  onRetrySearch: () => void;
  objectsOpen: boolean;
  onObjectsToggle: () => void;
  onMobileObjectsOpenChange: (open: boolean) => void;
  mobileObjectsTriggerRef: RefObject<HTMLButtonElement | null>;
};

function QueryContextBar({
  target,
  activeDatabase,
  navigatorTargets,
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
  objectsOpen,
  onObjectsToggle,
  onMobileObjectsOpenChange,
  mobileObjectsTriggerRef,
}: QueryContextBarProps) {
  const t = useTranslations("queryWorkbench");
  const navigator = (
    <QueryWorkbenchNavigator
      targets={navigatorTargets}
      activeTargetId={activeTargetId}
      filters={filters}
      engines={engines}
      pageInfo={pageInfo}
      onSelect={onSelect}
      onFilterChange={onFilterChange}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      onLoadAllEngines={onLoadAllEngines}
      loadingEngines={loadingEngines}
      targetLoadError={targetLoadError}
      searchError={searchError}
      onRetrySearch={onRetrySearch}
    />
  );

  if (!target) {
    return (
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
        <span className="flex-1" />
        {navigator}
      </div>
    );
  }

  const isProduction = target.connectionContext.environment === "production";
  const isReady = target.readiness === "ready";
  const truncatedName = target.displayName.length > 32
    ? `${target.displayName.slice(0, 30)}…`
    : target.displayName;

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3">
      <span
        className="max-w-[200px] truncate text-sm font-medium text-foreground"
        title={target.displayName}
      >
        {truncatedName}
      </span>

      {activeDatabase && (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Database className="size-3" aria-hidden />
          <span className="max-w-[120px] truncate">{activeDatabase}</span>
        </Badge>
      )}

      <Badge
        variant="secondary"
        className={cn(
          "text-xs",
          isProduction && "border-amber-500/30 text-amber-700 dark:text-amber-300",
        )}
      >
        {target.connectionContext.environment}
      </Badge>

      <Badge
        variant="secondary"
        className={cn(
          "text-xs",
          isReady
            ? "border-green-500/30 text-green-700 dark:text-green-300"
            : "border-amber-500/30 text-amber-700 dark:text-amber-300",
        )}
      >
        {isReady ? (
          <Check className="size-3" aria-hidden />
        ) : (
          <TriangleAlert className="size-3" aria-hidden />
        )}
        {t(readinessLabelKey(target.readiness))}
      </Badge>

      <span className="flex-1" />

      {/* Desktop objects toggle — accessible name from localized visible text. */}
      <Button
        type="button"
        variant={objectsOpen ? "secondary" : "ghost"}
        size="sm"
        className="hidden h-7 gap-1.5 text-xs lg:inline-flex"
        onClick={onObjectsToggle}
        aria-pressed={objectsOpen}
      >
        <ListTree className="size-3.5" aria-hidden />
        {t("schema.objectsLabel")}
      </Button>

      {/* Mobile objects toggle — focus returns here when the sheet closes. */}
      <Button
        ref={mobileObjectsTriggerRef}
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 text-xs lg:hidden"
        onClick={() => onMobileObjectsOpenChange(true)}
        aria-label={t("schema.openObjects")}
      >
        <ListTree className="size-3.5" aria-hidden />
        {t("schema.objectsLabel")}
      </Button>

      {navigator}
    </div>
  );
}
