"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  Layers,
  Loader2,
  Search,
  Shield,
  Trash2,
  Unlink,
  XCircle,
} from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type { PageInfo } from "@/types/resource";
import type {
  QueryCredentialEnvironmentPolicy,
  QueryCredentialRuntimeStatus,
  QueryCredentialStatusResponse,
  QueryCredentialWritableEnvironmentPolicy,
} from "@/types/query-credential";
import {
  deleteQueryCredential,
  getQueryCredential,
  saveQueryCredential,
} from "@/services/query-credentials";
import { getQueryTargets } from "@/services/query-targets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  credentialRuntimeStatusLabel,
  credentialRuntimeStatusTone,
  formatHostPortLabel,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";
import { useAdminRole } from "@/lib/auth-role";
import type {
  CredentialOperationRow,
  CoverageCounts,
  GroupingMode,
  TargetOperationResult,
} from "@/lib/query-credential-operations";
import {
  ALL_FILTER_VALUE,
  buildCredentialPutBody,
  buildOperationRows,
  collectClusters,
  collectEnvironments,
  collectEngines,
  collectRuntimeStatuses,
  CredentialFilterState,
  deriveCoverageCounts,
  EMPTY_CREDENTIAL_FILTERS,
  filterCredentialRows,
  groupOperationRows,
} from "@/lib/query-credential-operations";

// ---------------------------------------------------------------------------
// Concurrency limit for credential status fan-out
// ---------------------------------------------------------------------------
const FAN_OUT_CONCURRENCY = 4;
const CREDENTIAL_PAGE_SIZES = [25, 50, 100] as const;
type CredentialPageSize = (typeof CREDENTIAL_PAGE_SIZES)[number];
const MOBILE_BREAKPOINT = 640;

function toCredentialPageSize(pageSize: number): CredentialPageSize {
  if (pageSize === 50 || pageSize === 100) {
    return pageSize;
  }
  return 25;
}

function toCredentialPageSizeFromValue(
  pageSize: string | null,
): CredentialPageSize | null {
  switch (pageSize) {
    case "25":
      return 25;
    case "50":
      return 50;
    case "100":
      return 100;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

function useIsMobile(breakpoint = MOBILE_BREAKPOINT): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window !== "undefined" && window.matchMedia) {
      return !window.matchMedia(`(min-width: ${breakpoint}px)`).matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mql = window.matchMedia?.(`(min-width: ${breakpoint}px)`);
    if (!mql) return;

    const handler = (e: MediaQueryListEvent) => setIsMobile(!e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type QueryCredentialSettingsProps = {
  targets: QueryTarget[];
  pageInfo: PageInfo;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Admin-only credential operations surface (Phase 38B).
 *
 * Uses the shared `useAdminRole` hook which reads
 * `sessionStorage["controlhub.role"]` first, then falls back to decoding
 * the bearer token payload.  SSR and first client render are identical
 * (both produce the loading skeleton). Non-admin users see a "managed
 * by administrators" message.
 */
export function QueryCredentialSettings({
  targets,
  pageInfo,
}: QueryCredentialSettingsProps) {
  const t = useTranslations("queryCredentialSettings");
  const isAdmin = useAdminRole();

  // Credential status map: resourceId -> status or null
  const [credentialMap, setCredentialMap] = useState<
    Map<number, QueryCredentialStatusResponse | null>
  >(new Map());
  const [errorMap, setErrorMap] = useState<Map<number, string>>(new Map());
  const [statusesLoading, setStatusesLoading] = useState(false);
  const [targetList, setTargetList] = useState<QueryTarget[]>(targets);
  const [targetPageInfo, setTargetPageInfo] = useState<PageInfo>(pageInfo);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetLoadError, setTargetLoadError] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Filters and grouping
  const [filters, setFilters] = useState<CredentialFilterState>(
    EMPTY_CREDENTIAL_FILTERS,
  );
  const [groupingMode, setGroupingMode] = useState<GroupingMode>("flat");

  // Bulk operation results
  const [operationResults, setOperationResults] = useState<
    TargetOperationResult[]
  >([]);

  const [activeTargetId, setActiveTargetId] = useState<number | null>(null);
  const [dialogTargetId, setDialogTargetId] = useState<number | null>(null);
  const [page, setPage] = useState(pageInfo.page);
  const [pageSize, setPageSize] = useState<CredentialPageSize>(() =>
    toCredentialPageSize(pageInfo.pageSize),
  );
  const targetFetchGenerationRef = useRef(0);
  const targetFetchInitializedRef = useRef(false);
  const targetFetchControllerRef = useRef<AbortController | null>(null);
  const statusFetchGenerationRef = useRef(0);
  const targetListIdsKeyRef = useRef("");
  const visibleTargetIdsKeyRef = useRef("");

  // --- Fetch all credential statuses with bounded fan-out ---
  const fetchAllCredentialStatuses = useCallback(
    async (targetsForPage: QueryTarget[]) => {
      const generation = statusFetchGenerationRef.current + 1;
      statusFetchGenerationRef.current = generation;
      const targetPageGeneration = targetFetchGenerationRef.current;
      const targetIdsKey = targetsForPage
        .map((target) => target.resourceId)
        .join(",");
      if (targetsForPage.length === 0) {
        setCredentialMap(new Map());
        setErrorMap(new Map());
        setStatusesLoading(false);
        return;
      }

      setStatusesLoading(true);
      const newMap = new Map<number, QueryCredentialStatusResponse | null>();
      const newErrors = new Map<number, string>();

      // Process in batches of FAN_OUT_CONCURRENCY
      for (let i = 0; i < targetsForPage.length; i += FAN_OUT_CONCURRENCY) {
        const batch = targetsForPage.slice(i, i + FAN_OUT_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((target) => getQueryCredential(target.resourceId)),
        );

        if (
          statusFetchGenerationRef.current !== generation ||
          targetFetchGenerationRef.current !== targetPageGeneration ||
          targetListIdsKeyRef.current !== targetIdsKey
        ) {
          return;
        }

        for (let j = 0; j < batch.length; j++) {
          const result = results[j];
          const targetId = batch[j].resourceId;
          if (result.status === "fulfilled") {
            newMap.set(targetId, result.value);
          } else {
            newMap.set(targetId, null);
            newErrors.set(targetId, t("errors.loadFailed"));
          }
        }

        // Update state after each batch for progressive loading
        setCredentialMap(new Map(newMap));
        setErrorMap(new Map(newErrors));
      }

      if (
        statusFetchGenerationRef.current === generation &&
        targetFetchGenerationRef.current === targetPageGeneration &&
        targetListIdsKeyRef.current === targetIdsKey
      ) {
        setStatusesLoading(false);
      }
    },
    [t],
  );

  // --- Build operation rows ---
  const operationRows = useMemo(
    () => buildOperationRows(targetList, credentialMap, errorMap),
    [targetList, credentialMap, errorMap],
  );

  // --- Coverage counts ---
  const coverage = useMemo(
    () => deriveCoverageCounts(operationRows),
    [operationRows],
  );

  // --- Filtered rows ---
  const filteredRows = useMemo(
    () => filterCredentialRows(operationRows, filters),
    [operationRows, filters],
  );

  // --- Grouped rows ---
  const groups = useMemo(
    () => groupOperationRows(filteredRows, groupingMode),
    [filteredRows, groupingMode],
  );

  const pagedGroups = groups;

  const visibleRows = useMemo(
    () => pagedGroups.flatMap((group) => group.rows),
    [pagedGroups],
  );

  const visibleTargetIdsKey = useMemo(
    () => visibleRows.map((row) => row.resourceId).join(","),
    [visibleRows],
  );
  visibleTargetIdsKeyRef.current = visibleTargetIdsKey;

  const targetListIdsKey = useMemo(
    () => targetList.map((target) => target.resourceId).join(","),
    [targetList],
  );
  targetListIdsKeyRef.current = targetListIdsKey;

  useEffect(() => {
    if (isAdmin) {
      void fetchAllCredentialStatuses(targetList);
    }
  }, [isAdmin, targetList, fetchAllCredentialStatuses]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!targetFetchInitializedRef.current) {
      targetFetchInitializedRef.current = true;
      return;
    }

    const generation = targetFetchGenerationRef.current + 1;
    targetFetchGenerationRef.current = generation;
    targetFetchControllerRef.current?.abort();
    const controller = new AbortController();
    targetFetchControllerRef.current = controller;
    const trimmedQuery = filters.search.trim();

    const loadTargets = async () => {
      setTargetsLoading(true);
      setTargetLoadError(null);

      const response = await getQueryTargets(
        {
          page,
          pageSize,
          ...(trimmedQuery && { q: trimmedQuery }),
          ...(filters.engine !== "" &&
            filters.engine !== ALL_FILTER_VALUE && { engine: filters.engine }),
        },
        { signal: controller.signal },
      );

      if (
        targetFetchGenerationRef.current !== generation ||
        controller.signal.aborted
      ) {
        return;
      }
      setTargetList(response.items);
      setTargetPageInfo(response.pageInfo);
      setSelectedIds(new Set());
      setActiveTargetId(null);
      setDialogTargetId(null);
    };

    void loadTargets()
      .catch((error: unknown) => {
        if (
          targetFetchGenerationRef.current !== generation ||
          controller.signal.aborted
        ) {
          return;
        }
        setTargetLoadError(t("errors.loadTargetsFailed"));
      })
      .finally(() => {
        if (
          targetFetchGenerationRef.current === generation &&
          !controller.signal.aborted
        ) {
          setTargetsLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters.engine, filters.search, isAdmin, page, pageSize, t]);

  // --- Unique values for filter dropdowns ---
  const environments = useMemo(
    () => collectEnvironments(operationRows),
    [operationRows],
  );
  const clusters = useMemo(
    () => collectClusters(operationRows),
    [operationRows],
  );
  const engines = useMemo(
    () => collectEngines(operationRows),
    [operationRows],
  );
  const runtimeStatuses = useMemo(
    () => collectRuntimeStatuses(operationRows),
    [operationRows],
  );

  // --- Selection helpers ---
  const selectableRows = useMemo(
    () => visibleRows.filter((r) => r.selectable),
    [visibleRows],
  );

  const selectedCount = useMemo(
    () =>
      [...selectedIds].filter((id) =>
        selectableRows.some((r) => r.resourceId === id),
      ).length,
    [selectedIds, selectableRows],
  );

  const selectedOperationTargets = useMemo(
    () =>
      selectableRows
        .filter((row) => selectedIds.has(row.resourceId))
        .map((row) => ({
          resourceId: row.resourceId,
          displayName: row.displayName,
          resourceName: row.resourceName,
          connectionContext: {
            engine: row.engine,
            host: row.host,
            port: row.port,
            environment: row.environment,
            owner: "",
            clusterName: row.clusterName,
          },
        })) as QueryTarget[],
    [selectableRows, selectedIds],
  );

  function handleFilterByStatus(status: string) {
    if (status === "") {
      setFilters({ ...EMPTY_CREDENTIAL_FILTERS });
    } else if (status === "needs_attention") {
      setFilters({ ...EMPTY_CREDENTIAL_FILTERS, runtimeStatus: "needs_attention" });
    } else {
      setFilters({ ...EMPTY_CREDENTIAL_FILTERS, runtimeStatus: status });
    }
    setPage(1);
  }

  function handleFiltersChange(nextFilters: CredentialFilterState) {
    setFilters(nextFilters);
    setPage(1);
  }

  function handleGroupingModeChange(nextMode: GroupingMode) {
    setGroupingMode(nextMode);
    setPage(1);
  }

  function handlePageSizeChange(nextPageSize: string | null) {
    const nextSize = toCredentialPageSizeFromValue(nextPageSize);
    if (nextSize !== null) {
      setPageSize(nextSize);
      setPage(1);
    }
  }

  function toggleSelect(resourceId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
  }

  function clearResults() {
    setOperationResults([]);
  }

  function retryFetchForTarget(resourceId: number) {
    const target = targetList.find((t) => t.resourceId === resourceId);
    if (!target) return;
    const targetPageGeneration = targetFetchGenerationRef.current;
    const targetIdsKey = visibleTargetIdsKeyRef.current;
    void (async () => {
      try {
        const data = await getQueryCredential(resourceId);
        if (
          targetFetchGenerationRef.current !== targetPageGeneration ||
          visibleTargetIdsKeyRef.current !== targetIdsKey ||
          !targetIdsKey.split(",").includes(String(resourceId))
        ) {
          return;
        }
        setCredentialMap((prev) => new Map(prev).set(resourceId, data));
        setErrorMap((prev) => {
          const next = new Map(prev);
          next.delete(resourceId);
          return next;
        });
      } catch (error: unknown) {
        if (
          targetFetchGenerationRef.current !== targetPageGeneration ||
          visibleTargetIdsKeyRef.current !== targetIdsKey ||
          !targetIdsKey.split(",").includes(String(resourceId))
        ) {
          return;
        }
        setErrorMap((previous) =>
          new Map(previous).set(resourceId, t("errors.loadFailed")),
        );
      }
    })();
  }

  // --- Hydration-safe loading state ---
  if (isAdmin === null) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-xl border border-border bg-card">
        <Loader2
          className="size-5 animate-spin text-muted-foreground"
          aria-hidden
        />
      </div>
    );
  }

  // --- Non-admin: restricted view ---
  if (!isAdmin) {
    return (
      <div className="flex h-[400px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-card p-6 text-center">
        <Shield className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          {t("workbench.credentialManagedByAdmin")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("workbench.contactAdmin")}
        </p>
      </div>
    );
  }

  // --- Admin: full operations UI ---
  return (
    <div className="space-y-6">
      {/* Coverage summary cards */}
      <CoverageSummaryCards coverage={coverage} loading={statusesLoading} onFilterByStatus={handleFilterByStatus} />

      {/* Filter and grouping controls */}
      <FilterControls
        filters={filters}
        onFiltersChange={handleFiltersChange}
        groupingMode={groupingMode}
        onGroupingModeChange={handleGroupingModeChange}
        environments={environments}
        clusters={clusters}
        engines={engines}
        runtimeStatuses={runtimeStatuses}
      />

      {/* Bulk action bar */}
      <BulkActionBar
        selectedCount={selectedCount}
        selectedTargets={selectedOperationTargets}
        operationResults={operationResults}
        onClearResults={clearResults}
        onResultsAppended={(results) =>
          setOperationResults((prev) => [...prev, ...results])
        }
        onRefreshStatuses={() => void fetchAllCredentialStatuses(targetList)}
      />

      {/* Operations table + pagination */}
      <div className="space-y-4">
        {targetLoadError && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {targetLoadError}
          </p>
        )}
        <OperationsTable
          groups={pagedGroups}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          activeTargetId={activeTargetId}
          onSelectTarget={(id) => {
            setActiveTargetId(id);
            setDialogTargetId(id);
          }}
          onOpenDialog={(id) => {
            setActiveTargetId(id);
            setDialogTargetId(id);
          }}
          onRetryFetch={retryFetchForTarget}
        />

        <PaginationControls
          pageInfo={targetPageInfo}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <Dialog
        open={dialogTargetId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogTargetId(null);
          }
        }}
      >
        <DialogContent className="inset-0 max-h-none max-w-none translate-x-0 translate-y-0 overflow-y-auto overflow-x-hidden rounded-none p-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[85vh] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:p-4">
          <DialogHeader className="pr-8">
            <DialogTitle>
              {dialogTargetId !== null
                ? t("detail.title", {
                    name: targetList.find((t) => t.resourceId === dialogTargetId)?.displayName ?? "",
                  })
                : t("detail.title", { name: "" })}
            </DialogTitle>
          </DialogHeader>
          {dialogTargetId !== null && (
            <CredentialDetailPanel
              key={dialogTargetId}
              target={
                targetList.find((t) => t.resourceId === dialogTargetId) ?? targetList[0]
              }
              onCredentialChanged={() =>
                void fetchAllCredentialStatuses(targetList)
              }
              onClose={() => setDialogTargetId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {targetsLoading && <span className="sr-only">Loading query targets</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage Summary Cards
// ---------------------------------------------------------------------------

function CoverageSummaryCards({
  coverage,
  loading,
  onFilterByStatus,
}: {
  coverage: CoverageCounts;
  loading: boolean;
  onFilterByStatus: (status: string) => void;
}) {
  const t = useTranslations("queryCredentialSettings");

  const needsAttentionCount =
    coverage.missingMetadata +
    coverage.secretMissing +
    coverage.bindingMismatch +
    coverage.invalidRef +
    coverage.policyBlocked +
    coverage.disabled;

  const cards: { key: string; label: string; tone: string; count: number; filterValue: string }[] = [
    { key: "total", label: t("coverage.total"), tone: "text-foreground", count: coverage.total, filterValue: "" },
    { key: "ready", label: t("coverage.ready"), tone: "text-emerald-600 dark:text-emerald-400", count: coverage.ready, filterValue: "secret_resolved" },
    { key: "needsAttention", label: t("coverage.needsAttention"), tone: "text-amber-600 dark:text-amber-400", count: needsAttentionCount, filterValue: "needs_attention" },
    { key: "unsupported", label: t("coverage.unsupported"), tone: "text-rose-600 dark:text-rose-400", count: coverage.unsupportedOrIncomplete, filterValue: "unsupported_target" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          {t("coverage.title")}
        </h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {t("coverage.scope")}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => onFilterByStatus(card.filterValue)}
            className={cn(
              "rounded-lg border border-border bg-card p-3 text-center transition-colors hover:bg-muted/50",
              card.key === "total" && "cursor-default hover:bg-card",
            )}
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={cn("mt-1 text-xl font-bold", card.tone)}>
              {loading && card.key !== "total" ? (
                <Loader2
                  className="mx-auto size-5 animate-spin"
                  aria-hidden
                />
              ) : (
                card.count
              )}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter Controls
// ---------------------------------------------------------------------------

function FilterControls({
  filters,
  onFiltersChange,
  groupingMode,
  onGroupingModeChange,
  environments,
  clusters,
  engines,
  runtimeStatuses,
}: {
  filters: CredentialFilterState;
  onFiltersChange: (f: CredentialFilterState) => void;
  groupingMode: GroupingMode;
  onGroupingModeChange: (m: GroupingMode) => void;
  environments: string[];
  clusters: string[];
  engines: string[];
  runtimeStatuses: string[];
}) {
  const t = useTranslations("queryCredentialSettings");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  function updateFilter<K extends keyof CredentialFilterState>(
    key: K,
    value: CredentialFilterState[K],
  ) {
    onFiltersChange({ ...filters, [key]: value });
  }

  const needsAttentionStatuses = ["missing_metadata", "secret_missing", "binding_mismatch", "invalid_ref", "policy_blocked", "disabled"];
  const displayStatuses = [
    ...runtimeStatuses.filter((s) => !needsAttentionStatuses.includes(s)),
    "needs_attention",
  ];

  function getRuntimeStatusLabel(status: string): string {
    if (status === "needs_attention") {
      return t("coverage.needsAttention");
    }
    return credentialRuntimeStatusLabel(t, status);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder={t("filters.search")}
            aria-label={t("filters.search")}
            className="h-9 pl-8"
          />
        </div>

        {/* Runtime status filter */}
        <Select
          value={filters.runtimeStatus || ALL_FILTER_VALUE}
          onValueChange={(v) => v !== null && updateFilter("runtimeStatus", v)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <span>
              {filters.runtimeStatus
                ? getRuntimeStatusLabel(filters.runtimeStatus)
                : t("filters.allStatuses")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>
              {t("filters.allStatuses")}
            </SelectItem>
            {displayStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {getRuntimeStatusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Environment filter */}
        <Select
          value={filters.environment || ALL_FILTER_VALUE}
          onValueChange={(v) => v !== null && updateFilter("environment", v)}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <span>
              {filters.environment || t("filters.allEnvironments")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>
              {t("filters.allEnvironments")}
            </SelectItem>
            {environments.map((env) => (
              <SelectItem key={env} value={env}>
                {env}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* More filters button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowMoreFilters(!showMoreFilters)}
          className="h-9 gap-1.5"
        >
          <Filter className="size-3.5" aria-hidden />
          {showMoreFilters ? t("filters.hideFilters") : t("filters.moreFilters")}
        </Button>
      </div>

      {/* Additional filters (collapsed by default) */}
      {showMoreFilters && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Engine filter */}
          <Select
            value={filters.engine || ALL_FILTER_VALUE}
            onValueChange={(v) => v !== null && updateFilter("engine", v)}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <span>{filters.engine || t("filters.allEngines")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>
                {t("filters.allEngines")}
              </SelectItem>
              {engines.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Cluster filter */}
          <Select
            value={filters.cluster || ALL_FILTER_VALUE}
            onValueChange={(v) => v !== null && updateFilter("cluster", v)}
          >
            <SelectTrigger className="h-9 w-[150px]">
              <span>{filters.cluster || t("filters.allClusters")}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>
                {t("filters.allClusters")}
              </SelectItem>
              {clusters.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Configured state filter */}
          <Select
            value={filters.configuredState}
            onValueChange={(v) => v !== null && updateFilter("configuredState", v)}
          >
            <SelectTrigger className="h-9 w-[130px]">
              <span>
                {filters.configuredState === "all"
                  ? t("filters.all")
                  : filters.configuredState === "configured"
                    ? t("filters.configured")
                    : t("filters.unconfigured")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.all")}</SelectItem>
              <SelectItem value="configured">
                {t("filters.configured")}
              </SelectItem>
              <SelectItem value="unconfigured">
                {t("filters.unconfigured")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Readiness filter */}
          <Select
            value={filters.readinessFilter}
            onValueChange={(v) => v !== null && updateFilter("readinessFilter", v)}
          >
            <SelectTrigger className="h-9 w-[120px]">
              <span>
                {filters.readinessFilter === "all"
                  ? t("filters.all")
                  : filters.readinessFilter === "ready"
                    ? t("filters.ready")
                    : t("filters.notReady")}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.all")}</SelectItem>
              <SelectItem value="ready">{t("filters.ready")}</SelectItem>
              <SelectItem value="not_ready">
                {t("filters.notReady")}
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Grouping mode */}
          <div className="flex items-center gap-1.5">
            <Layers className="size-4 text-muted-foreground" aria-hidden />
            <Select
              value={groupingMode}
              onValueChange={(v) => onGroupingModeChange(v as GroupingMode)}
            >
              <SelectTrigger className="h-9 w-[130px]">
                <span>
                  {groupingMode === "flat"
                    ? t("grouping.flat")
                    : groupingMode === "environment"
                      ? t("grouping.environment")
                      : t("grouping.cluster")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="flat">{t("grouping.flat")}</SelectItem>
                <SelectItem value="environment">
                  {t("grouping.environment")}
                </SelectItem>
                <SelectItem value="cluster">
                  {t("grouping.cluster")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Action Bar
// ---------------------------------------------------------------------------

function BulkActionBar({
  selectedCount,
  selectedTargets,
  operationResults,
  onClearResults,
  onResultsAppended,
  onRefreshStatuses,
}: {
  selectedCount: number;
  selectedTargets: QueryTarget[];
  operationResults: TargetOperationResult[];
  onClearResults: () => void;
  onResultsAppended: (results: TargetOperationResult[]) => void;
  onRefreshStatuses: () => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const [showBulkApply, setShowBulkApply] = useState(false);
  const [showBulkRemove, setShowBulkRemove] = useState(false);

  if (selectedCount === 0 && operationResults.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("operations.selectedCount", { count: selectedCount })}
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => setShowBulkApply(true)}
          >
            {t("bulkApply.button")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowBulkRemove(true)}
          >
            <Trash2 className="size-3.5" aria-hidden />
            {t("bulkRemove.button")}
          </Button>
        </div>
      )}

      {/* Operation results */}
      {operationResults.length > 0 && (
        <OperationResultsPanel
          results={operationResults}
          onClear={onClearResults}
        />
      )}

      {/* Bulk apply dialog */}
      {showBulkApply && (
        <BulkApplyDialog
          selectedTargets={selectedTargets}
          onClose={() => setShowBulkApply(false)}
          onResults={(results) => {
            onResultsAppended(results);
            onRefreshStatuses();
          }}
        />
      )}

      {/* Bulk remove dialog */}
      {showBulkRemove && (
        <BulkRemoveDialog
          selectedTargets={selectedTargets}
          onClose={() => setShowBulkRemove(false)}
          onResults={(results) => {
            onResultsAppended(results);
            onRefreshStatuses();
          }}
        />
      )}
    </div>
  );
}

function PaginationControls({
  pageInfo,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  pageInfo: PageInfo;
  pageSize: CredentialPageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: string | null) => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const tPagination = useTranslations("pagination");
  const start =
    pageInfo.totalItems === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1;
  const end = Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.totalItems);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm text-muted-foreground">
          {t("operations.pagination.showing", {
            start,
            end,
            total: pageInfo.totalItems,
          })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("operations.pagination.scope")}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button
          aria-label={tPagination("previous")}
          type="button"
          variant="outline"
          size="sm"
          disabled={!pageInfo.hasPreviousPage}
          onClick={() => onPageChange(pageInfo.page - 1)}
        >
          {tPagination("previous")}
        </Button>
        <Button
          aria-label={tPagination("next")}
          type="button"
          variant="outline"
          size="sm"
          disabled={!pageInfo.hasNextPage}
          onClick={() => onPageChange(pageInfo.page + 1)}
        >
          {tPagination("next")}
        </Button>
        <Select value={String(pageSize)} onValueChange={onPageSizeChange}>
          <SelectTrigger aria-label={t("operations.pagination.pageSize")} size="sm">
            <span>{t("operations.pagination.pageSizeValue", { pageSize })}</span>
          </SelectTrigger>
          <SelectContent>
            {CREDENTIAL_PAGE_SIZES.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {t("operations.pagination.pageSizeValue", { pageSize: option })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Apply Dialog
// ---------------------------------------------------------------------------

function BulkApplyDialog({
  selectedTargets,
  onClose,
  onResults,
}: {
  selectedTargets: QueryTarget[];
  onClose: () => void;
  onResults: (results: TargetOperationResult[]) => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const [credentialRef, setCredentialRef] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [environmentPolicy, setEnvironmentPolicy] =
    useState<QueryCredentialWritableEnvironmentPolicy>("non_prod_only");
  const [confirmAllEnvironments, setConfirmAllEnvironments] = useState(false);
  const [applying, setApplying] = useState(false);

  const isAllEnvironments = environmentPolicy === "all_environments";
  const canApply =
    credentialRef.trim() !== "" && (!isAllEnvironments || confirmAllEnvironments);

  // P4: detect cross-environment/cluster/host:port selection
  const crossTargetWarning = useMemo(() => {
    const envs = new Set(selectedTargets.map((t) => t.connectionContext.environment));
    const clusters = new Set(
      selectedTargets.map((t) => t.connectionContext.clusterName ?? ""),
    );
    const hostPorts = new Set(
      selectedTargets.map(
        (t) => `${t.connectionContext.host}:${t.connectionContext.port}`,
      ),
    );
    if (envs.size > 1 || clusters.size > 1 || hostPorts.size > 1) {
      return t("bulkApply.crossTargetWarning");
    }
    return null;
  }, [selectedTargets, t]);

  async function handleApply() {
    if (!canApply) return;
    setApplying(true);

    const body = buildCredentialPutBody({
      credentialRef: credentialRef.trim(),
      enabled,
      environmentPolicy,
      confirmAllEnvironments: isAllEnvironments ? true : undefined,
    });

    const results: TargetOperationResult[] = [];

    for (const target of selectedTargets) {
      try {
        const response = await saveQueryCredential(target.resourceId, body);
        results.push({
          resourceId: target.resourceId,
          displayName: target.displayName,
          status: "success",
          error: null,
          runtimeStatusAfter: response.runtimeStatus,
        });
      } catch (caught) {
        results.push({
          resourceId: target.resourceId,
          displayName: target.displayName,
          status: "failure",
          error: t("errors.saveFailed"),
          runtimeStatusAfter: null,
        });
      }
    }

    onResults(results);
    setApplying(false);
    onClose();
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t("bulkApply.title")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("bulkApply.description")}
      </p>
      <p className="text-xs font-medium text-foreground">
        {t("bulkApply.targetCount", { count: selectedTargets.length })}
      </p>

      {/* P4: Cross-environment/cluster/host:port warning */}
      {crossTargetWarning && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden
            />
            <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
              {crossTargetWarning}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {/* Credential ref */}
        <div>
          <label
            htmlFor="bulk-credential-ref"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("bulkApply.credentialRef")}
          </label>
          <Input
            id="bulk-credential-ref"
            value={credentialRef}
            onChange={(e) => setCredentialRef(e.target.value)}
            placeholder={t("bulkApply.credentialRefPlaceholder")}
            className="mt-1"
          />
        </div>

        {/* Enabled */}
        <div className="flex items-center gap-2">
          <input
            id="bulk-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <label htmlFor="bulk-enabled" className="text-sm text-foreground">
            {t("bulkApply.enabled")}
          </label>
        </div>

        {/* Environment policy */}
        <div>
          <label
            htmlFor="bulk-environment-policy"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("bulkApply.environmentPolicy")}
          </label>
          <Select
            value={environmentPolicy}
            onValueChange={(v) => {
              setEnvironmentPolicy(
                v as QueryCredentialWritableEnvironmentPolicy,
              );
              if (v !== "all_environments") {
                setConfirmAllEnvironments(false);
              }
            }}
          >
            <SelectTrigger id="bulk-environment-policy" className="mt-1">
              <span>
                {t(`environmentPolicies.${environmentPolicy}`)}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_prod_only">
                {t("environmentPolicies.non_prod_only")}
              </SelectItem>
              <SelectItem value="all_environments">
                {t("environmentPolicies.all_environments")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* All-environments confirmation */}
        {isAllEnvironments && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <input
                id="bulk-confirm-all-environments"
                type="checkbox"
                checked={confirmAllEnvironments}
                onChange={(e) => setConfirmAllEnvironments(e.target.checked)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <label
                htmlFor="bulk-confirm-all-environments"
                className="text-xs leading-relaxed text-amber-800 dark:text-amber-200"
              >
                {t("bulkApply.confirmAllEnvironments")}
              </label>
            </div>
            {!confirmAllEnvironments && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("bulkApply.confirmAllEnvironmentsRequired")}
              </p>
            )}
          </div>
        )}

        {/* Dry summary */}
        <p className="text-xs text-muted-foreground">
          {t("bulkApply.drySummary")}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          disabled={!canApply || applying}
          onClick={() => void handleApply()}
        >
          {applying ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("bulkApply.applying")}
            </>
          ) : (
            t("bulkApply.applyButton")
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("bulkApply.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Remove Dialog
// ---------------------------------------------------------------------------

function BulkRemoveDialog({
  selectedTargets,
  onClose,
  onResults,
}: {
  selectedTargets: QueryTarget[];
  onClose: () => void;
  onResults: (results: TargetOperationResult[]) => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const [confirmed, setConfirmed] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!confirmed) return;
    setRemoving(true);

    const results: TargetOperationResult[] = [];

    for (const target of selectedTargets) {
      try {
        await deleteQueryCredential(target.resourceId);
        results.push({
          resourceId: target.resourceId,
          displayName: target.displayName,
          status: "success",
          error: null,
          runtimeStatusAfter: null,
        });
      } catch (caught) {
        results.push({
          resourceId: target.resourceId,
          displayName: target.displayName,
          status: "failure",
          error: t("errors.removeFailed"),
          runtimeStatusAfter: null,
        });
      }
    }

    onResults(results);
    setRemoving(false);
    onClose();
  }

  return (
    <div className="space-y-4 rounded-xl border border-rose-500/40 bg-rose-500/5 p-4">
      <h3 className="text-sm font-semibold text-foreground">
        {t("bulkRemove.title")}
      </h3>
      <p className="text-xs text-muted-foreground">
        {t("bulkRemove.description")}
      </p>
      <p className="text-xs font-medium text-foreground">
        {t("bulkRemove.targetCount", { count: selectedTargets.length })}
      </p>

      {/* Target sample */}
      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-muted-foreground">
        {selectedTargets.slice(0, 10).map((target) => (
          <li key={target.resourceId}>· {target.displayName}</li>
        ))}
        {selectedTargets.length > 10 && (
          <li>… {selectedTargets.length - 10} more</li>
        )}
      </ul>

      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
        {t("bulkRemove.warning")}
      </p>

      {/* Confirmation */}
      <div className="flex items-start gap-2">
        <input
          id="bulk-remove-confirm"
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 size-4 rounded border-border"
        />
        <label
          htmlFor="bulk-remove-confirm"
          className="text-xs leading-relaxed text-foreground"
        >
          {t("detail.removeConfirmDescription")}
        </label>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="destructive"
          disabled={!confirmed || removing}
          onClick={() => void handleRemove()}
        >
          {removing ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("bulkRemove.removing")}
            </>
          ) : (
            t("bulkRemove.confirmButton")
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("bulkRemove.cancel")}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operation Results Panel
// ---------------------------------------------------------------------------

function OperationResultsPanel({
  results,
  onClear,
}: {
  results: TargetOperationResult[];
  onClear: () => void;
}) {
  const t = useTranslations("queryCredentialSettings");

  const successCount = results.filter((r) => r.status === "success").length;
  const failureCount = results.filter((r) => r.status === "failure").length;
  const pendingCount = results.filter((r) => r.status === "pending").length;

  const summaryText =
    failureCount === 0 && pendingCount === 0
      ? t("bulkApply.allSuccess")
      : successCount === 0 && pendingCount === 0
        ? t("bulkApply.allFailure")
        : t("bulkApply.partialFailure");

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">
          {t("operationResults.title")} — {summaryText}
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          {t("operationResults.clearResults")}
        </Button>
      </div>

      <div className="flex gap-3 text-xs">
        {successCount > 0 && (
          <span className="text-emerald-600 dark:text-emerald-400">
            {successCount} {t("operationResults.success")}
          </span>
        )}
        {failureCount > 0 && (
          <span className="text-rose-600 dark:text-rose-400">
            {failureCount} {t("operationResults.failure")}
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-muted-foreground">
            {pendingCount} {t("operationResults.pending")}
          </span>
        )}
      </div>

      {/* Per-target results */}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {results.map((result) => (
          <li
            key={result.resourceId}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
          >
            <span className="truncate text-foreground">
              {result.displayName}
            </span>
            <span className="shrink-0">
              {result.status === "success" ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400"
                >
                  {t("operationResults.success")}
                  {result.runtimeStatusAfter
                    ? ` · ${credentialRuntimeStatusLabel(t, result.runtimeStatusAfter)}`
                    : ""}
                </Badge>
              ) : result.status === "failure" ? (
                <Badge
                  variant="outline"
                  className="border-rose-500/30 text-xs text-rose-600 dark:text-rose-400"
                >
                  {t("operationResults.failure")}
                  {result.error ? ` · ${result.error}` : ""}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  <Loader2 className="mr-1 size-3 animate-spin" aria-hidden />
                  {t("operationResults.pending")}
                </Badge>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Operations Table
// ---------------------------------------------------------------------------

function OperationsTable({
  groups,
  selectedIds,
  onToggleSelect,
  activeTargetId,
  onSelectTarget,
  onOpenDialog,
  onRetryFetch,
}: {
  groups: { key: string; label: string; rows: CredentialOperationRow[] }[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  activeTargetId: number | null;
  onSelectTarget: (id: number) => void;
  onOpenDialog: (id: number) => void;
  onRetryFetch: (id: number) => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const isMobile = useIsMobile();

  const allRows = groups.flatMap((g) => g.rows);
  const selectableRows = allRows.filter((r) => r.selectable);
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selectedIds.has(r.resourceId));

  function handleToggleAll() {
    if (allSelected) {
      for (const r of selectableRows) {
        if (selectedIds.has(r.resourceId)) onToggleSelect(r.resourceId);
      }
    } else {
      for (const r of selectableRows) {
        if (!selectedIds.has(r.resourceId)) onToggleSelect(r.resourceId);
      }
    }
  }

  if (allRows.length === 0) {
    return (
      <EmptyState
        title={t("operations.noTargets")}
        description=""
      />
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.key}>
          {group.label && (
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group.label}
            </h3>
          )}
          {isMobile ? (
            <div className="space-y-2">
              {group.rows.map((row) => (
                <MobileOperationCard
                  key={row.resourceId}
                  row={row}
                  selected={selectedIds.has(row.resourceId)}
                  onToggleSelect={onToggleSelect}
                  isActive={activeTargetId === row.resourceId}
                  onSelectTarget={onSelectTarget}
                  onOpenDialog={onOpenDialog}
                  onRetryFetch={onRetryFetch}
                />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={handleToggleAll}
                        aria-label={t("operations.selectAll")}
                        className="size-4 rounded border-border"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.target")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.context")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.runtime")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.binding")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.policy")}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      {t("operations.columns.action")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {group.rows.map((row) => (
                    <OperationRow
                      key={row.resourceId}
                      row={row}
                      selected={selectedIds.has(row.resourceId)}
                      onToggleSelect={onToggleSelect}
                      isActive={activeTargetId === row.resourceId}
                      onSelectTarget={onSelectTarget}
                      onOpenDialog={onOpenDialog}
                      onRetryFetch={onRetryFetch}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Operation Card (responsive: visible below sm breakpoint)
// ---------------------------------------------------------------------------

function MobileOperationCard({
  row,
  selected,
  onToggleSelect,
  isActive,
  onSelectTarget,
  onOpenDialog,
  onRetryFetch,
}: {
  row: CredentialOperationRow;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  isActive: boolean;
  onSelectTarget: (id: number) => void;
  onOpenDialog: (id: number) => void;
  onRetryFetch: (id: number) => void;
}) {
  const t = useTranslations("queryCredentialSettings");

  const statusLabel =
    row.runtimeStatus === "fetch_pending"
      ? t("coverage.fetchPending")
      : row.runtimeStatus === "fetch_error"
        ? t("coverage.fetchError")
        : credentialRuntimeStatusLabel(t, row.runtimeStatus);

  const tone =
    row.runtimeStatus === "fetch_pending"
      ? "amber"
      : credentialRuntimeStatusTone(row.runtimeStatus);

  const toneClass =
    tone === "green"
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
        : "border-amber-500/30 text-amber-600 dark:text-amber-400";

  const environmentPolicyLabel = row.credential
    ? t(`environmentPolicies.${row.credential.environmentPolicy}`, {
        defaultMessage: row.credential.environmentPolicy.replaceAll("_", " "),
      })
    : "—";

  return (
    <div
      aria-selected={isActive}
      className={cn(
        "rounded-xl border border-border bg-card p-3 space-y-2.5 transition-colors",
        isActive && "bg-muted/50",
      )}
    >
      {/* Header: checkbox + target name + action button */}
      <div className="flex items-center gap-2">
        {row.selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.resourceId)}
            className="size-4 rounded border-border"
          />
        ) : (
          <span
            title={
              row.notSelectableReason
                ? t(`operations.notSelectable.${row.notSelectableReason}`)
                : undefined
            }
          >
            <input
              type="checkbox"
              disabled
              className="size-4 rounded border-border opacity-50"
            />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => onSelectTarget(row.resourceId)}
            className="text-left text-sm font-medium text-foreground hover:underline truncate block"
          >
            {row.displayName}
          </button>
          <p className="text-xs text-muted-foreground truncate">
            {formatHostPortLabel(row.host, row.port, "—")}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs shrink-0"
          onClick={() => onOpenDialog(row.resourceId)}
        >
          {row.credential?.configured
            ? t("detail.editButton")
            : t("detail.configureButton")}
        </Button>
      </div>

      {/* Context: engine, environment, cluster */}
      <div className="text-xs text-muted-foreground">
        <span>{row.engine}</span>
        <span className="mx-1">·</span>
        <span>{row.environment}</span>
        {row.clusterName && (
          <>
            <span className="mx-1">·</span>
            <span>{row.clusterName}</span>
          </>
        )}
      </div>

      {/* Binding and policy */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <div>
          <dt className="text-muted-foreground">
            {t("operations.columns.binding")}
          </dt>
          <dd className="text-foreground">
            {row.credential?.configured
              ? row.credential.credentialRef || "—"
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            {t("operations.columns.policy")}
          </dt>
          <dd className="text-foreground">{environmentPolicyLabel}</dd>
        </div>
      </dl>

      {/* Runtime status badge */}
      <div className="flex items-center gap-1.5">
        {row.runtimeStatus === "fetch_error" ? (
          <>
            <Badge variant="outline" className={cn("text-xs", toneClass)}>
              {statusLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => onRetryFetch(row.resourceId)}
            >
              {t("operations.retryFetch")}
            </Button>
          </>
        ) : (
          <Badge variant="outline" className={cn("text-xs", toneClass)}>
            {statusLabel}
          </Badge>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Operation Row
// ---------------------------------------------------------------------------

function OperationRow({
  row,
  selected,
  onToggleSelect,
  isActive,
  onSelectTarget,
  onOpenDialog,
  onRetryFetch,
}: {
  row: CredentialOperationRow;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  isActive: boolean;
  onSelectTarget: (id: number) => void;
  onOpenDialog: (id: number) => void;
  onRetryFetch: (id: number) => void;
}) {
  const t = useTranslations("queryCredentialSettings");

  const statusLabel =
    row.runtimeStatus === "fetch_pending"
      ? t("coverage.fetchPending")
      : row.runtimeStatus === "fetch_error"
        ? t("coverage.fetchError")
        : credentialRuntimeStatusLabel(t, row.runtimeStatus);

  const tone =
    row.runtimeStatus === "fetch_pending"
      ? "amber"
      : credentialRuntimeStatusTone(row.runtimeStatus);

  const toneClass =
    tone === "green"
      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
      : tone === "red"
        ? "border-rose-500/30 text-rose-600 dark:text-rose-400"
        : "border-amber-500/30 text-amber-600 dark:text-amber-400";

  const environmentPolicyLabel = row.credential
    ? t(`environmentPolicies.${row.credential.environmentPolicy}`, {
        defaultMessage: row.credential.environmentPolicy.replaceAll("_", " "),
      })
    : "—";

  return (
    <tr
      aria-selected={isActive}
      className={cn(
        "transition-colors hover:bg-muted/30",
        isActive && "bg-muted/50",
      )}
    >
      {/* Checkbox */}
      <td className="px-3 py-2 w-10">
        {row.selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.resourceId)}
            className="size-4 rounded border-border"
          />
        ) : (
          <span
            title={
              row.notSelectableReason
                ? t(`operations.notSelectable.${row.notSelectableReason}`)
                : undefined
            }
          >
            <input
              type="checkbox"
              disabled
              className="size-4 rounded border-border opacity-50"
            />
          </span>
        )}
      </td>

      {/* Target: name + host:port */}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <div>
            <button
              type="button"
              onClick={() => onSelectTarget(row.resourceId)}
              className="text-left text-sm font-medium text-foreground hover:underline"
            >
              {row.displayName}
            </button>
            <p className="text-xs text-muted-foreground">
              {formatHostPortLabel(row.host, row.port, "—")}
            </p>
          </div>
        </div>
      </td>

      {/* Context: engine, environment, cluster */}
      <td className="px-3 py-2">
        <div className="text-xs text-muted-foreground">
          <span>{row.engine}</span>
          <span className="mx-1">·</span>
          <span>{row.environment}</span>
          {row.clusterName && (
            <>
              <span className="mx-1">·</span>
              <span>{row.clusterName}</span>
            </>
          )}
        </div>
      </td>

      {/* Runtime: status badge */}
      <td className="px-3 py-2">
        {row.runtimeStatus === "fetch_error" ? (
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className={cn("text-xs", toneClass)}>
              {statusLabel}
            </Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs"
              onClick={() => onRetryFetch(row.resourceId)}
            >
              {t("operations.retryFetch")}
            </Button>
          </div>
        ) : (
          <Badge variant="outline" className={cn("text-xs", toneClass)}>
            {statusLabel}
          </Badge>
        )}
      </td>

      {/* Binding: credential ref */}
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.credential?.configured ? row.credential.credentialRef || "—" : "—"}
      </td>

      {/* Policy: environment policy */}
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {environmentPolicyLabel}
      </td>

      {/* Action: edit button */}
      <td className="px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onOpenDialog(row.resourceId)}
        >
          {row.credential?.configured
            ? t("detail.editButton")
            : t("detail.configureButton")}
        </Button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Credential Detail Panel (preserved from Phase 38A)
// ---------------------------------------------------------------------------

function toWritablePolicy(
  policy: QueryCredentialEnvironmentPolicy,
): QueryCredentialWritableEnvironmentPolicy {
  if (policy === "all_environments") return "all_environments";
  return "non_prod_only";
}

function CredentialDetailPanel({
  target,
  onCredentialChanged,
  onClose,
}: {
  target: QueryTarget;
  onCredentialChanged: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("queryCredentialSettings");
  const tWorkbench = useTranslations("queryWorkbench");
  const [credential, setCredential] =
    useState<QueryCredentialStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [credentialRef, setCredentialRef] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [environmentPolicy, setEnvironmentPolicy] =
    useState<QueryCredentialWritableEnvironmentPolicy>("non_prod_only");
  const [confirmAllEnvironments, setConfirmAllEnvironments] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const activeTargetIdRef = useRef(target.resourceId);

  const isConfigured = credential?.configured ?? false;
  const isAllEnvironments = environmentPolicy === "all_environments";
  const canSave =
    credentialRef.trim() !== "" && (!isAllEnvironments || confirmAllEnvironments);

  const loadCredential = useCallback(async (targetId: number) => {
    activeTargetIdRef.current = targetId;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const data = await getQueryCredential(targetId);
      if (activeTargetIdRef.current !== targetId) return;
      setCredential(data);
      setCredentialRef(data.credentialRef);
      setEnabled(data.enabled);
      setEnvironmentPolicy(toWritablePolicy(data.environmentPolicy));
      setConfirmAllEnvironments(false);
      setIsDirty(false);
    } catch {
      if (activeTargetIdRef.current !== targetId) return;
      setError(t("operations.fetchErrorLabel"));
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    activeTargetIdRef.current = target.resourceId;
    void loadCredential(target.resourceId);
  }, [target.resourceId, loadCredential]);

  function markDirty() {
    setIsDirty(true);
  }

  function handleClose() {
    if (isDirty) {
      setShowUnsavedConfirm(true);
    } else {
      onClose();
    }
  }

  async function handleSave() {
    if (!canSave) return;
    const targetId = target.resourceId;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body = buildCredentialPutBody({
        credentialRef: credentialRef.trim(),
        enabled,
        environmentPolicy,
        confirmAllEnvironments: isAllEnvironments ? true : undefined,
      });
      const result = await saveQueryCredential(targetId, body);
      if (activeTargetIdRef.current !== targetId) return;
      setCredential(result);
      setSuccess(t("detail.saved"));
      setIsDirty(false);
      onCredentialChanged();
    } catch (caught) {
      if (activeTargetIdRef.current !== targetId) return;
      setError(t("errors.saveFailed"));
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setSaving(false);
      }
    }
  }

  async function handleDelete() {
    const targetId = target.resourceId;
    setRemoving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteQueryCredential(targetId);
      if (activeTargetIdRef.current !== targetId) return;
      await loadCredential(targetId);
      if (activeTargetIdRef.current !== targetId) return;
      setSuccess(t("detail.removed"));
      setShowRemoveConfirm(false);
      onCredentialChanged();
    } catch (caught) {
      if (activeTargetIdRef.current !== targetId) return;
      setError(t("errors.removeFailed"));
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setRemoving(false);
      }
    }
  }

  const runtimeStatus = credential?.runtimeStatus ?? "missing_metadata";
  const runtimeTone = getRuntimeTone(runtimeStatus);

  return (
    <div className="flex flex-col h-full">
      {/* Header: target identity and runtime status */}
      <div className="space-y-3 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("detail.targetLabel")}
          </span>
          <span className="text-sm font-medium text-foreground">
            {target.displayName}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{target.connectionContext.engine}</span>
          <span>·</span>
          <span>{target.connectionContext.environment}</span>
          <span>·</span>
          <span>
            {formatHostPortLabel(
              target.connectionContext.host,
              target.connectionContext.port,
              tWorkbench("connection.incomplete"),
            )}
          </span>
        </div>
        {/* Runtime status badge */}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("detail.runtimeLabel")}…
          </div>
        ) : (
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3",
              runtimeTone === "green" &&
                "border-emerald-500/40 bg-emerald-500/10",
              runtimeTone === "amber" &&
                "border-amber-500/40 bg-amber-500/10",
              runtimeTone === "red" && "border-rose-500/40 bg-rose-500/10",
            )}
          >
            {runtimeTone === "green" ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                aria-hidden
              />
            ) : runtimeTone === "red" ? (
              <XCircle
                className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400"
                aria-hidden
              />
            ) : (
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
                aria-hidden
              />
            )}
            <div>
              <p
                className={cn(
                  "text-sm font-semibold",
                  runtimeTone === "green" &&
                    "text-emerald-700 dark:text-emerald-300",
                  runtimeTone === "amber" &&
                    "text-amber-700 dark:text-amber-300",
                  runtimeTone === "red" &&
                    "text-rose-700 dark:text-rose-300",
                )}
              >
                {t(`runtimeStatus.${runtimeStatus}`)}
              </p>
              {credential?.message && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {credential.message}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Success display */}
      {success && (
        <div
          role="status"
          className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {success}
        </div>
      )}

      {/* Form fields */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {/* Credential ref */}
        <div>
          <label
            htmlFor="credential-ref"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("detail.credentialRefLabel")}
          </label>
          <Input
            id="credential-ref"
            value={credentialRef}
            onChange={(e) => {
              setCredentialRef(e.target.value);
              markDirty();
            }}
            placeholder={t("detail.credentialRefPlaceholder")}
            disabled={loading}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t("detail.credentialRefHint")}
          </p>
          {credentialRef.trim() !== "" && (
            <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
              <p className="text-xs font-medium text-muted-foreground">
                {t("detail.derivedEnvVarLabel")}
              </p>
              <code className="mt-0.5 block font-mono text-xs text-foreground">
                CONTROLHUB_QUERY_CREDENTIAL_{credentialRef.trim()}
              </code>
            </div>
          )}
        </div>

        {/* Enabled */}
        <div className="flex items-center gap-2">
          <input
            id="credential-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              setEnabled(e.target.checked);
              markDirty();
            }}
            disabled={loading}
            className="size-4 rounded border-border"
          />
          <label
            htmlFor="credential-enabled"
            className="text-sm text-foreground"
          >
            {t("detail.enabledLabel")}
          </label>
        </div>

        {/* Environment policy */}
        <div>
          <label
            htmlFor="environment-policy"
            className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("detail.environmentPolicyLabel")}
          </label>
          <Select
            value={environmentPolicy}
            onValueChange={(v) => {
              setEnvironmentPolicy(
                v as QueryCredentialWritableEnvironmentPolicy,
              );
              if (v !== "all_environments") {
                setConfirmAllEnvironments(false);
              }
              markDirty();
            }}
            disabled={loading}
          >
            <SelectTrigger id="environment-policy" className="mt-1">
              <span>{t(`environmentPolicies.${environmentPolicy}`)}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_prod_only">
                {t("environmentPolicies.non_prod_only")}
              </SelectItem>
              <SelectItem value="all_environments">
                {t("environmentPolicies.all_environments")}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isAllEnvironments && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
            <div className="flex items-start gap-2">
              <input
                id="confirm-all-environments"
                type="checkbox"
                checked={confirmAllEnvironments}
                onChange={(e) => {
                  setConfirmAllEnvironments(e.target.checked);
                  markDirty();
                }}
                className="mt-0.5 size-4 rounded border-border"
              />
              <label
                htmlFor="confirm-all-environments"
                className="text-xs leading-relaxed text-amber-800 dark:text-amber-200"
              >
                {t("confirmAllEnvironments.label")}
              </label>
            </div>
            {!confirmAllEnvironments && (
              <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                {t("confirmAllEnvironments.required")}
              </p>
            )}
          </div>
        )}

        {/* Boundary note */}
        <div className="rounded-lg border border-border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">
            {t("detail.boundaryNote")}
          </p>
        </div>
      </div>

      {/* Sticky footer: Cancel/Save + Remove */}
      <div className="sticky bottom-0 bg-popover border-t border-border pt-4 pb-2 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={!canSave || saving || loading}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t("detail.saving")}
              </>
            ) : (
              t("detail.saveButton")
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
          >
            {t("common.actions.cancel")}
          </Button>
        </div>

        {/* Remove button */}
        {isConfigured && !showRemoveConfirm && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={removing}
            onClick={() => setShowRemoveConfirm(true)}
          >
            <Unlink className="size-3.5 mr-1.5" aria-hidden />
            {t("detail.removeButton")}
          </Button>
        )}

        {isConfigured && showRemoveConfirm && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
            <p className="text-xs text-destructive">
              {t("detail.removeConfirmDescription")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={removing}
                onClick={() => void handleDelete()}
              >
                {removing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    {t("detail.removing")}
                  </>
                ) : (
                  t("detail.removeConfirmTitle")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRemoveConfirm(false)}
              >
                {t("common.actions.cancel")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Unsaved changes confirmation dialog */}
      {showUnsavedConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-xl bg-popover p-4 max-w-sm mx-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              {t("detail.unsavedChangesTitle")}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("detail.unsavedChangesDescription")}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => {
                  setShowUnsavedConfirm(false);
                  onClose();
                }}
              >
                {t("detail.unsavedChangesDiscard")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowUnsavedConfirm(false)}
              >
                {t("detail.unsavedChangesCancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getRuntimeTone(
  status: QueryCredentialRuntimeStatus,
): "green" | "amber" | "red" {
  switch (status) {
    case "secret_resolved":
      return "green";
    case "missing_metadata":
    case "disabled":
    case "policy_blocked":
    case "secret_missing":
    case "incomplete_connection":
      return "amber";
    case "invalid_ref":
    case "binding_mismatch":
    case "unsupported_target":
      return "red";
    default:
      return "amber";
  }
}
