"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Filter,
  Layers,
  Link,
  Loader2,
  Search,
  Shield,
  Trash2,
  Unlink,
  XCircle,
} from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type QueryCredentialSettingsProps = {
  targets: QueryTarget[];
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
}: QueryCredentialSettingsProps) {
  const t = useTranslations("queryCredentialSettings");
  const isAdmin = useAdminRole();

  // Credential status map: resourceId -> status or null
  const [credentialMap, setCredentialMap] = useState<
    Map<number, QueryCredentialStatusResponse | null>
  >(new Map());
  const [errorMap, setErrorMap] = useState<Map<number, string>>(new Map());
  const [statusesLoading, setStatusesLoading] = useState(false);

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

  // Active detail target (for single-target edit panel)
  const [activeTargetId, setActiveTargetId] = useState<number | null>(null);

  // --- Fetch all credential statuses with bounded fan-out ---
  const fetchAllCredentialStatuses = useCallback(
    async (targetList: QueryTarget[]) => {
      setStatusesLoading(true);
      const newMap = new Map<number, QueryCredentialStatusResponse | null>();
      const newErrors = new Map<number, string>();

      // Process in batches of FAN_OUT_CONCURRENCY
      for (let i = 0; i < targetList.length; i += FAN_OUT_CONCURRENCY) {
        const batch = targetList.slice(i, i + FAN_OUT_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((target) => getQueryCredential(target.resourceId)),
        );

        for (let j = 0; j < batch.length; j++) {
          const result = results[j];
          const targetId = batch[j].resourceId;
          if (result.status === "fulfilled") {
            newMap.set(targetId, result.value);
          } else {
            newMap.set(targetId, null);
            newErrors.set(
              targetId,
              result.reason instanceof Error
                ? result.reason.message
                : "Failed to load",
            );
          }
        }

        // Update state after each batch for progressive loading
        setCredentialMap(new Map(newMap));
        setErrorMap(new Map(newErrors));
      }

      setStatusesLoading(false);
    },
    [],
  );

  useEffect(() => {
    if (isAdmin && targets.length > 0) {
      // Intentional: fetch credential statuses after hydration when admin.
      // This fires once on mount (or when targets change), not a cascading loop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void fetchAllCredentialStatuses(targets);
    }
  }, [isAdmin, targets, fetchAllCredentialStatuses]);

  // --- Build operation rows ---
  const operationRows = useMemo(
    () => buildOperationRows(targets, credentialMap, errorMap),
    [targets, credentialMap, errorMap],
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
    () => filteredRows.filter((r) => r.selectable),
    [filteredRows],
  );

  const selectedCount = useMemo(
    () =>
      [...selectedIds].filter((id) =>
        selectableRows.some((r) => r.resourceId === id),
      ).length,
    [selectedIds, selectableRows],
  );

  const allFilteredSelected =
    selectableRows.length > 0 && selectedCount === selectableRows.length;

  // --- P1 fix: actual operation targets = visible + selectable + selected ---
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

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableRows.map((r) => r.resourceId)));
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
    const target = targets.find((t) => t.resourceId === resourceId);
    if (!target) return;
    void (async () => {
      try {
        const data = await getQueryCredential(resourceId);
        setCredentialMap((prev) => new Map(prev).set(resourceId, data));
        setErrorMap((prev) => {
          const next = new Map(prev);
          next.delete(resourceId);
          return next;
        });
      } catch {
        // error stays
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
      <CoverageSummaryCards coverage={coverage} loading={statusesLoading} />

      {/* Filter and grouping controls */}
      <FilterControls
        filters={filters}
        onFiltersChange={setFilters}
        groupingMode={groupingMode}
        onGroupingModeChange={setGroupingMode}
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
        onRefreshStatuses={() => void fetchAllCredentialStatuses(targets)}
      />

      {/* Operations table */}
      <OperationsTable
        groups={groups}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
        allFilteredSelected={allFilteredSelected}
        selectableCount={selectableRows.length}
        activeTargetId={activeTargetId}
        onSelectTarget={setActiveTargetId}
        onRetryFetch={retryFetchForTarget}
      />

      {/* Single-target detail panel */}
      {activeTargetId !== null && (
        <CredentialDetailPanel
          key={activeTargetId}
          target={
            targets.find((t) => t.resourceId === activeTargetId) ?? targets[0]
          }
          onCredentialChanged={() => void fetchAllCredentialStatuses(targets)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coverage Summary Cards
// ---------------------------------------------------------------------------

function CoverageSummaryCards({
  coverage,
  loading,
}: {
  coverage: CoverageCounts;
  loading: boolean;
}) {
  const t = useTranslations("queryCredentialSettings");

  const cards: { key: keyof CoverageCounts; label: string; tone: string }[] = [
    { key: "total", label: t("coverage.total"), tone: "text-foreground" },
    {
      key: "ready",
      label: t("coverage.ready"),
      tone: "text-emerald-600 dark:text-emerald-400",
    },
    {
      key: "missingMetadata",
      label: t("coverage.missingMetadata"),
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "secretMissing",
      label: t("coverage.secretMissing"),
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "bindingMismatch",
      label: t("coverage.bindingMismatch"),
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      key: "invalidRef",
      label: t("coverage.invalidRef"),
      tone: "text-rose-600 dark:text-rose-400",
    },
    {
      key: "policyBlocked",
      label: t("coverage.policyBlocked"),
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      key: "disabled",
      label: t("coverage.disabled"),
      tone: "text-muted-foreground",
    },
    {
      key: "unsupportedOrIncomplete",
      label: t("coverage.unsupportedOrIncomplete"),
      tone: "text-rose-600 dark:text-rose-400",
    },
  ];

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {t("coverage.title")}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map((card) => (
          <div
            key={card.key}
            className="rounded-lg border border-border bg-card p-3 text-center"
          >
            <p className="text-xs text-muted-foreground">{card.label}</p>
            <p className={cn("mt-1 text-xl font-bold", card.tone)}>
              {loading && card.key !== "total" ? (
                <Loader2
                  className="mx-auto size-5 animate-spin"
                  aria-hidden
                />
              ) : (
                coverage[card.key]
              )}
            </p>
          </div>
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

  function updateFilter<K extends keyof CredentialFilterState>(
    key: K,
    value: CredentialFilterState[K],
  ) {
    onFiltersChange({ ...filters, [key]: value });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">
          {t("filters.title")}
        </h2>
      </div>

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

        {/* Runtime status filter */}
        <Select
          value={filters.runtimeStatus || ALL_FILTER_VALUE}
          onValueChange={(v) => v !== null && updateFilter("runtimeStatus", v)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <span>
              {filters.runtimeStatus
                ? credentialRuntimeStatusLabel(t, filters.runtimeStatus)
                : t("filters.allStatuses")}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>
              {t("filters.allStatuses")}
            </SelectItem>
            {runtimeStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                {credentialRuntimeStatusLabel(t, s)}
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
          error:
            caught instanceof Error ? caught.message : "Unknown error",
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
          error:
            caught instanceof Error ? caught.message : "Unknown error",
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
                    ? ` · ${result.runtimeStatusAfter.replaceAll("_", " ")}`
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
  onToggleSelectAll,
  allFilteredSelected,
  selectableCount,
  activeTargetId,
  onSelectTarget,
  onRetryFetch,
}: {
  groups: { key: string; label: string; rows: CredentialOperationRow[] }[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
  allFilteredSelected: boolean;
  selectableCount: number;
  activeTargetId: number | null;
  onSelectTarget: (id: number) => void;
  onRetryFetch: (id: number) => void;
}) {
  const t = useTranslations("queryCredentialSettings");

  const allRows = groups.flatMap((g) => g.rows);
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
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected && selectableCount > 0}
                      onChange={onToggleSelectAll}
                      disabled={selectableCount === 0}
                      className="size-4 rounded border-border"
                      aria-label={t("operations.selectTarget")}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.target")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.engine")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.environment")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.cluster")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.hostPort")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.runtimeStatus")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.credentialRef")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.policy")}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    {t("operations.columns.enabled")}
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
                    onRetryFetch={onRetryFetch}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
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
  onRetryFetch,
}: {
  row: CredentialOperationRow;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  isActive: boolean;
  onSelectTarget: (id: number) => void;
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
      className={cn(
        "transition-colors hover:bg-muted/30",
        isActive && "bg-muted/50",
      )}
    >
      <td className="px-3 py-2">
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
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => onSelectTarget(row.resourceId)}
          className="text-left text-sm font-medium text-foreground hover:underline"
        >
          {row.displayName}
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.engine}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.environment}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.clusterName || "—"}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {formatHostPortLabel(row.host, row.port, "—")}
      </td>
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
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.credential?.configured ? row.credential.credentialRef || "—" : "—"}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {environmentPolicyLabel}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">
        {row.credential?.configured
          ? row.credential.enabled
            ? "✓"
            : "✗"
          : "—"}
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
}: {
  target: QueryTarget;
  onCredentialChanged: () => void;
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
  const [showBindingHelp, setShowBindingHelp] = useState(false);

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
    } catch {
      if (activeTargetIdRef.current !== targetId) return;
      setError("Failed to load credential status");
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    activeTargetIdRef.current = target.resourceId;
    void loadCredential(target.resourceId);
  }, [target.resourceId, loadCredential]);

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
      onCredentialChanged();
    } catch (caught) {
      if (activeTargetIdRef.current !== targetId) return;
      setError(
        caught instanceof Error ? caught.message : "Failed to save credential",
      );
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
      setShowRemoveConfirm(false);
      onCredentialChanged();
    } catch (caught) {
      if (activeTargetIdRef.current !== targetId) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Failed to remove credential",
      );
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setRemoving(false);
      }
    }
  }

  const runtimeStatus = credential?.runtimeStatus ?? "missing_metadata";
  const runtimeTone = getRuntimeTone(runtimeStatus);

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">
        {t("detail.title")}
      </h2>

      {/* Target info */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("detail.targetLabel")}
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {target.displayName} · {target.connectionContext.engine} ·{" "}
          {target.connectionContext.environment} ·{" "}
          {formatHostPortLabel(
            target.connectionContext.host,
            target.connectionContext.port,
            tWorkbench("connection.incomplete"),
          )}
        </p>
      </div>

      {/* DBA model guidance - collapsible */}
      <div>
        <button
          type="button"
          onClick={() => setShowBindingHelp(!showBindingHelp)}
          className="flex w-full items-center gap-2 text-sm font-semibold text-foreground hover:underline"
        >
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              showBindingHelp && "rotate-180",
            )}
            aria-hidden
          />
          {t("detail.howThisBindingWorks")}
        </button>
        {showBindingHelp && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Shield className="size-4 text-blue-500" aria-hidden />
                {t("dbaStandardAccount")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("dbaStandardAccountDescription")}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/10 p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Link className="size-4 text-purple-500" aria-hidden />
                {t("clusterOverride")}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {t("clusterOverrideDescription")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Runtime status */}
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

      {/* Error display */}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Success display */}
      {success && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
        >
          {success}
        </div>
      )}

      {/* Form fields */}
      <div className="space-y-3">
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
            onChange={(e) => setCredentialRef(e.target.value)}
            placeholder={t("detail.credentialRefPlaceholder")}
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

        <div className="flex items-center gap-2">
          <input
            id="credential-enabled"
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4 rounded border-border"
          />
          <label
            htmlFor="credential-enabled"
            className="text-sm text-foreground"
          >
            {t("detail.enabledLabel")}
          </label>
        </div>

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
            }}
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
                onChange={(e) =>
                  setConfirmAllEnvironments(e.target.checked)
                }
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
      </div>

      {/* Boundary note */}
      <div className="rounded-lg border border-border bg-muted/20 p-3">
        <p className="text-xs text-muted-foreground">
          {t("detail.boundaryNote")}
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!canSave || saving}
          onClick={() => void handleSave()}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {t("detail.saving")}
            </>
          ) : (
            <>
              <ExternalLink className="size-3.5" aria-hidden />
              {t("detail.saveButton")}
            </>
          )}
        </Button>

        {isConfigured && !showRemoveConfirm && (
          <Button
            type="button"
            variant="outline"
            disabled={removing}
            onClick={() => setShowRemoveConfirm(true)}
          >
            <Unlink className="size-3.5" aria-hidden />
            {t("detail.removeButton")}
          </Button>
        )}

        {isConfigured && showRemoveConfirm && (
          <>
            <Button
              type="button"
              variant="destructive"
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
              onClick={() => setShowRemoveConfirm(false)}
            >
              {t("detail.removeConfirmDescription").split(".")[0]}
            </Button>
          </>
        )}
      </div>

      {showRemoveConfirm && (
        <p className="text-xs text-muted-foreground">
          {t("detail.removeConfirmDescription")}
        </p>
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
