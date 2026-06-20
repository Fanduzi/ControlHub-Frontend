"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/blocks/empty-state";
import {
  ALL_FILTER_VALUE,
  EMPTY_FILTERS,
  QUERY_KIND_OPTIONS,
  READINESS_OPTIONS,
  collectEngines,
  filterTargets,
  formatHostPort,
  isAllFilter,
  queryKindLabelKey,
  readinessLabelKey,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { QuerySchemaBrowser } from "@/components/query/query-schema-browser";
import { QueryEditorShell } from "@/components/query/query-editor-shell";
import { QueryGovernancePanel } from "@/components/query/query-governance-panel";

type QueryWorkbenchProps = {
  targets: QueryTarget[];
  initialFilters?: WorkbenchFilters;
};

type ContextRow = {
  key: string;
  label: string;
  value: string;
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

  const engines = useMemo(() => collectEngines(targets), [targets]);
  const filteredTargets = useMemo(
    () => filterTargets(targets, filters),
    [targets, filters],
  );
  const activeTarget =
    filteredTargets.find((target) => target.resourceId === activeTargetId) ??
    filteredTargets[0] ??
    null;

  function updateFilter(patch: Partial<WorkbenchFilters>) {
    setFilters((previous) => ({ ...previous, ...patch }));
  }

  return (
    <div className="space-y-4">
      <SafetyBanner />

      <TargetSwitcher
        activeTarget={activeTarget}
        filteredTargets={filteredTargets}
        onSelect={setActiveTargetId}
      />

      <FilterBar filters={filters} engines={engines} onChange={updateFilter} />

      {activeTarget ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
          <QuerySchemaBrowser target={activeTarget} />
          <QueryEditorShell target={activeTarget} />
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

function TargetSwitcher({
  activeTarget,
  filteredTargets,
  onSelect,
}: {
  activeTarget: QueryTarget | null;
  filteredTargets: QueryTarget[];
  onSelect: (id: number) => void;
}) {
  const t = useTranslations("queryWorkbench");
  const contextRows = activeTarget ? buildContextRows(activeTarget, t) : [];

  return (
    <section
      aria-label={t("switcher.label")}
      className="space-y-3 rounded-xl border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="query-target-switcher"
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {t("switcher.label")}
          </label>
          <Select
            value={activeTarget ? String(activeTarget.resourceId) : undefined}
            onValueChange={(value) => {
              if (value) {
                onSelect(Number(value));
              }
            }}
          >
            <SelectTrigger
              id="query-target-switcher"
              className="h-9 w-full min-w-[260px] max-w-xl"
              disabled={filteredTargets.length === 0}
            >
              <SelectValue placeholder={t("switcher.placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {filteredTargets.map((target) => (
                <SelectItem key={target.resourceId} value={String(target.resourceId)}>
                  {target.displayName} · {target.connectionContext.engine}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Badge variant="outline" className="self-start lg:self-auto">
          {t("switcher.summary", { count: filteredTargets.length })}
        </Badge>
      </div>

      {activeTarget ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-3 lg:grid-cols-4">
          {contextRows.map((row) => (
            <div key={row.key} className="flex flex-col gap-0.5">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </dt>
              <dd className="text-sm font-medium text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}

function buildContextRows(
  target: QueryTarget,
  t: ReturnType<typeof useTranslations<"queryWorkbench">>,
): ContextRow[] {
  const rows: ContextRow[] = [
    { key: "engine", label: t("context.engine"), value: target.connectionContext.engine },
    { key: "environment", label: t("context.environment"), value: target.connectionContext.environment },
    {
      key: "hostPort",
      label: t("context.hostPort"),
      value: formatHostPort(target.connectionContext.host, target.connectionContext.port),
    },
    { key: "owner", label: t("context.owner"), value: target.connectionContext.owner },
    { key: "language", label: t("context.language"), value: target.capability.languageLabel },
    {
      key: "readiness",
      label: t("context.readiness"),
      value: t(readinessLabelKey(target.readiness)),
    },
  ];

  if (target.connectionContext.clusterName) {
    rows.push({
      key: "cluster",
      label: t("context.cluster"),
      value: target.connectionContext.clusterName,
    });
  }

  return rows;
}

function FilterBar({
  filters,
  engines,
  onChange,
}: {
  filters: WorkbenchFilters;
  engines: string[];
  onChange: (patch: Partial<WorkbenchFilters>) => void;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <Input
        type="search"
        value={filters.q}
        onChange={(event) => onChange({ q: event.target.value })}
        placeholder={t("filters.search")}
        aria-label={t("filters.search")}
        className="h-9 sm:max-w-xs"
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          ariaLabel={t("context.engine")}
          value={isAllFilter(filters.engine) ? ALL_FILTER_VALUE : filters.engine}
          allLabel={t("filters.engine")}
          onValueChange={(value) => onChange({ engine: value })}
          options={engines.map((engine) => ({ value: engine, label: engine }))}
        />
        <FilterSelect
          ariaLabel={t("context.editorMode")}
          value={isAllFilter(filters.queryKind) ? ALL_FILTER_VALUE : filters.queryKind}
          allLabel={t("filters.queryKind")}
          onValueChange={(value) => onChange({ queryKind: value })}
          options={QUERY_KIND_OPTIONS.map((kind) => ({
            value: kind,
            label: t(queryKindLabelKey(kind)),
          }))}
        />
        <FilterSelect
          ariaLabel={t("context.readiness")}
          value={isAllFilter(filters.readiness) ? ALL_FILTER_VALUE : filters.readiness}
          allLabel={t("filters.readiness")}
          onValueChange={(value) => onChange({ readiness: value })}
          options={READINESS_OPTIONS.map((readiness) => ({
            value: readiness,
            label: t(readinessLabelKey(readiness)),
          }))}
        />
      </div>
    </div>
  );
}

function FilterSelect({
  ariaLabel,
  value,
  allLabel,
  onValueChange,
  options,
}: {
  ariaLabel: string;
  value: string;
  allLabel: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "")}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="min-w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_FILTER_VALUE}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
