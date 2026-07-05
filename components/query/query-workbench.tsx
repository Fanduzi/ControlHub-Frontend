"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, TriangleAlert } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { EmptyState } from "@/components/blocks/empty-state";
import { cn } from "@/lib/utils";
import {
  ALL_FILTER_VALUE,
  EMPTY_FILTERS,
  QUERY_KIND_OPTIONS,
  READINESS_OPTIONS,
  collectEngines,
  filterTargets,
  formatHostPortLabel,
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
          {/*
            Key on resourceId so the editor remounts when the selected target
            changes. This guarantees no target-owned local state (statement,
            result, error, history, progress) can carry over from one target to
            another. The editor additionally guards its async work against stale
            targets, but the remount is the hard boundary that keeps each
            target's worksheet fully isolated.
          */}
          <QueryEditorShell key={activeTarget.resourceId} target={activeTarget} />
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

/**
 * Sort targets: ready targets first, then alphabetically by display name.
 * Pure — returns a new array, never mutates the input.
 */
function sortTargetsForPicker(targets: QueryTarget[]): QueryTarget[] {
  return [...targets].sort((a, b) => {
    const aReady = a.readiness === "ready" ? 0 : 1;
    const bReady = b.readiness === "ready" ? 0 : 1;
    if (aReady !== bReady) return aReady - bReady;
    return a.displayName.localeCompare(b.displayName);
  });
}

/**
 * Build a searchable haystack for a target. Includes all fields that the
 * picker should match against. Pure — no hooks.
 */
function targetSearchHaystack(target: QueryTarget): string {
  return [
    target.displayName,
    target.resourceName,
    target.connectionContext.engine,
    target.connectionContext.environment,
    target.connectionContext.host,
    target.connectionContext.clusterName ?? "",
  ]
    .join(" ")
    .toLowerCase();
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
  const [open, setOpen] = useState(false);
  const contextRows = activeTarget ? buildContextRows(activeTarget, t) : [];

  const sortedTargets = useMemo(
    () => sortTargetsForPicker(filteredTargets),
    [filteredTargets],
  );

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
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              id="query-target-switcher"
              className="h-9 w-full min-w-[300px] max-w-xl"
              disabled={filteredTargets.length === 0}
              render={<Button variant="outline" />}
            >
              <span className="flex-1 truncate text-left">
                {activeTarget
                  ? `${activeTarget.displayName} · ${activeTarget.connectionContext.engine}`
                  : t("switcher.placeholder")}
              </span>
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent
              className="w-[var(--popover-anchor-width)] p-0"
              align="start"
            >
              <Command
                filter={(value, search) => {
                  // value is the resourceId string; search against the haystack
                  const target = sortedTargets.find(
                    (t) => String(t.resourceId) === value,
                  );
                  if (!target) return 0;
                  return targetSearchHaystack(target).includes(
                    search.toLowerCase(),
                  )
                    ? 1
                    : 0;
                }}
              >
                <CommandInput placeholder={t("switcher.searchPlaceholder")} />
                <CommandList>
                  <CommandEmpty>{t("switcher.noMatch")}</CommandEmpty>
                  <CommandGroup>
                    {sortedTargets.map((target) => {
                      const hostPort = formatHostPortLabel(
                        target.connectionContext.host,
                        target.connectionContext.port,
                        t("connection.incomplete"),
                      );
                      const isReady = target.readiness === "ready";
                      return (
                        <CommandItem
                          key={target.resourceId}
                          value={String(target.resourceId)}
                          onSelect={(value) => {
                            onSelect(Number(value));
                            setOpen(false);
                          }}
                          className={cn(
                            "flex flex-col items-start gap-0.5 py-2",
                            isReady &&
                              "border-l-2 border-l-green-500",
                          )}
                        >
                          <div className="flex w-full items-center gap-2">
                            <span className="flex-1 truncate font-medium">
                              {target.displayName}
                            </span>
                            <Check
                              className={cn(
                                "size-4 shrink-0",
                                activeTarget?.resourceId ===
                                  target.resourceId
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                            <span>{target.connectionContext.engine}</span>
                            <span className="text-border">·</span>
                            <span>{target.connectionContext.environment}</span>
                            {hostPort !== t("connection.incomplete") && (
                              <>
                                <span className="text-border">·</span>
                                <span>{hostPort}</span>
                              </>
                            )}
                            <span className="text-border">·</span>
                            <span
                              className={cn(
                                isReady
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {t(readinessLabelKey(target.readiness))}
                            </span>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
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
      value: formatHostPortLabel(
        target.connectionContext.host,
        target.connectionContext.port,
        t("connection.incomplete"),
      ),
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
  // Render the selected option's localized label explicitly. We must NOT use
  // <SelectValue /> here: its value is a raw enum/id, which would leak machine
  // strings (e.g. "credential_required", "22") into the closed trigger.
  const selectedLabel =
    value === ALL_FILTER_VALUE
      ? allLabel
      : (options.find((option) => option.value === value)?.label ?? allLabel);

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "")}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="min-w-[140px]">
        <span>{selectedLabel}</span>
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
