"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, Database, ListTree, TriangleAlert, XCircle } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
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

  const OBJECTS_PANE_STORAGE_KEY = "query-objects-pane-open";
  const OBJECTS_WIDTH_STORAGE_KEY = "query-objects-pane-width";
  const MIN_OBJECTS_WIDTH = 240;
  const MAX_OBJECTS_WIDTH = 280;
  const DEFAULT_OBJECTS_WIDTH = 260;

  const [objectsOpen, setObjectsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(OBJECTS_PANE_STORAGE_KEY) === "true";
  });
  const [mobileObjectsOpen, setMobileObjectsOpen] = useState(false);
  const mobileObjectsTriggerRef = useRef<HTMLButtonElement>(null);
  const [objectsPaneWidth, setObjectsPaneWidth] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_OBJECTS_WIDTH;
    const stored = Number(window.localStorage.getItem(OBJECTS_WIDTH_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= MIN_OBJECTS_WIDTH && stored <= MAX_OBJECTS_WIDTH
      ? stored
      : DEFAULT_OBJECTS_WIDTH;
  });
  const objectsPaneWidthRef = useRef(objectsPaneWidth);

  useEffect(() => {
    objectsPaneWidthRef.current = objectsPaneWidth;
  }, [objectsPaneWidth]);

  useEffect(() => {
    window.localStorage.setItem(OBJECTS_PANE_STORAGE_KEY, String(objectsOpen));
  }, [objectsOpen]);

  function handleObjectsResizePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startWidth = objectsPaneWidthRef.current;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextWidth = Math.min(
        MAX_OBJECTS_WIDTH,
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
    if (activeDatabase) {
      params.set("database", activeDatabase);
    } else {
      params.delete("database");
    }
    router.replace(`${pathname}?${params.toString()}`);
  }, [activeDatabase, pathname, router, searchParams]);

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

  const activeTarget =
    activeTargetId === null ? null : targetsById.get(activeTargetId) ?? null;

  function updateFilter(patch: Partial<WorkbenchFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
  }

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
    params.delete("database");
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setActiveTargetFromWorksheet(resourceId: number) {
    if (!targetsById.has(resourceId)) {
      return;
    }
    setActiveTargetId(resourceId);
  }

  return (
    <div className="flex min-h-0 flex-col gap-0">
      {activeTarget ? (
        <>
          <QueryContextBar
            target={activeTarget}
            activeDatabase={activeDatabase}
            navigatorTargets={navigatorTargets}
            activeTargetId={activeTargetId}
            filters={filters}
            engines={engines}
            pageInfo={pageInfo}
            onSelect={setActiveTargetFromNavigator}
            onFilterChange={updateFilter}
            objectsOpen={objectsOpen}
            onObjectsToggle={() => setObjectsOpen((prev) => !prev)}
            onMobileObjectsOpenChange={setMobileObjectsOpen}
            mobileObjectsTriggerRef={mobileObjectsTriggerRef}
          />
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
                  aria-label={t("schema.resizeObjects")}
                  onPointerDown={handleObjectsResizePointerDown}
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
              />
            </div>
          </div>
        </>
      ) : (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      )}
    </div>
  );
}

type QueryContextBarProps = {
  target: QueryTarget;
  activeDatabase: string | null;
  navigatorTargets: QueryTarget[];
  activeTargetId: number | null;
  filters: WorkbenchFilters;
  engines: string[];
  pageInfo: PageInfo;
  onSelect: (resourceId: number) => void;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
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
  objectsOpen,
  onObjectsToggle,
  onMobileObjectsOpenChange,
  mobileObjectsTriggerRef,
}: QueryContextBarProps) {
  const t = useTranslations("queryWorkbench");
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

      <QueryWorkbenchNavigator
        targets={navigatorTargets}
        activeTargetId={activeTargetId}
        filters={filters}
        engines={engines}
        pageInfo={pageInfo}
        onSelect={onSelect}
        onFilterChange={onFilterChange}
      />
    </div>
  );
}
