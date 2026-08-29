"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { RefObject } from "react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  ALL_FILTER_VALUE,
  QUERY_KIND_OPTIONS,
  READINESS_OPTIONS,
  formatHostPortLabel,
  isAllFilter,
  queryKindLabelKey,
  readinessLabelKey,
  type TargetGroup,
  type WorkbenchFilters,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";
import { ConnectionTargetGroups } from "@/components/query/query-connection-navigator-list";

type NavigatorBodyProps = {
  activeTarget: QueryTarget | null;
  filters: WorkbenchFilters;
  groupedTargets: TargetGroup[];
  engines: string[];
  pageInfo?: string;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  onFilterChange: (patch: Partial<WorkbenchFilters>) => void;
  onSelect: (resourceId: number) => void;
  onLoadMore?: () => void;
  onLoadAllEngines?: () => void;
  loadingEngines?: boolean;
  targetLoadError?: string | null;
  searchInputRef?: RefObject<HTMLInputElement | null>;
};

export function NavigatorBody({
  activeTarget,
  filters,
  groupedTargets,
  engines,
  pageInfo,
  canLoadMore = false,
  loadingMore = false,
  onFilterChange,
  onSelect,
  onLoadMore,
  onLoadAllEngines,
  loadingEngines = false,
  targetLoadError,
  searchInputRef,
}: NavigatorBodyProps) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-2">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="text"
            value={filters.q}
            onChange={(event) => onFilterChange({ q: event.target.value })}
            placeholder={t("connectionNavigator.searchPlaceholder")}
            className="h-8 pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("connectionNavigator.filters")}
          </span>
          <WorkbenchFilterSelect
            ariaLabel={t("context.engine")}
            value={isAllFilter(filters.engine) ? ALL_FILTER_VALUE : filters.engine}
            allLabel={t("connectionNavigator.allEngines")}
            onValueChange={(value) => onFilterChange({ engine: value })}
            options={engines.map((engine) => ({ value: engine, label: engine }))}
          />
          <WorkbenchFilterSelect
            ariaLabel={t("context.editorMode")}
            value={isAllFilter(filters.queryKind) ? ALL_FILTER_VALUE : filters.queryKind}
            allLabel={t("connectionNavigator.allModes")}
            onValueChange={(value) => onFilterChange({ queryKind: value })}
            options={QUERY_KIND_OPTIONS.map((kind) => ({
              value: kind,
              label: t(queryKindLabelKey(kind)),
            }))}
          />
          <WorkbenchFilterSelect
            ariaLabel={t("context.readiness")}
            value={isAllFilter(filters.readiness) ? ALL_FILTER_VALUE : filters.readiness}
            allLabel={t("connectionNavigator.allReadiness")}
            onValueChange={(value) => onFilterChange({ readiness: value })}
            options={READINESS_OPTIONS.map((readiness) => ({
              value: readiness,
              label: t(readinessLabelKey(readiness)),
            }))}
          />
          {onLoadAllEngines && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loadingEngines}
              onClick={onLoadAllEngines}
            >
              {t("connectionNavigator.loadAllEngines")}
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[340px] overflow-y-auto">
        <ConnectionTargetGroups
          activeTarget={activeTarget}
          groups={groupedTargets}
          onSelect={onSelect}
        />
      </div>

      {pageInfo && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {pageInfo}
        </p>
      )}

      {targetLoadError && (
        <p role="alert" className="text-xs text-destructive">
          {targetLoadError}
        </p>
      )}

      {canLoadMore && onLoadMore && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingMore}
          onClick={onLoadMore}
        >
          {t("connectionNavigator.loadMore")}
        </Button>
      )}
    </div>
  );
}

export function ActiveConnectionSummary({ target }: { readonly target: QueryTarget }) {
  const t = useTranslations("queryWorkbench");

  return (
    <section
      aria-label={t("connectionNavigator.activeConnection")}
      className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-2.5"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("connectionNavigator.activeConnection")}
      </div>
      <div className="text-sm font-medium text-foreground">{target.displayName}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-xs">
          {target.connectionContext.engine}
        </Badge>
        <Badge variant="secondary" className="text-xs">
          {target.connectionContext.environment}
        </Badge>
        <ActiveStatusBadge readiness={target.readiness} />
        <HostPortBadge target={target} />
      </div>
    </section>
  );
}

function ActiveStatusBadge({ readiness }: { readiness: QueryTarget["readiness"] }) {
  const t = useTranslations("queryWorkbench");
  const isReady = readiness === "ready";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "text-xs",
        isReady
          ? "border-green-500/30 text-green-700 dark:text-green-300"
          : "border-amber-500/30 text-amber-700 dark:text-amber-300",
      )}
    >
      {isReady ? t("connectionNavigator.ready") : t(readinessLabelKey(readiness))}
    </Badge>
  );
}

function HostPortBadge({ target }: { target: QueryTarget }) {
  const t = useTranslations("queryWorkbench");
  const label = formatHostPortLabel(
    target.connectionContext.host,
    target.connectionContext.port,
    t("connection.incomplete"),
  );

  if (label === t("connection.incomplete")) return null;

  return (
    <Badge variant="outline" className="font-mono text-xs">
      {label}
    </Badge>
  );
}

function WorkbenchFilterSelect({
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
  const selectedLabel =
    value === ALL_FILTER_VALUE
      ? allLabel
      : (options.find((option) => option.value === value)?.label ?? allLabel);

  return (
    <Select value={value} onValueChange={(next) => onValueChange(next ?? "")}>
      <SelectTrigger size="sm" aria-label={ariaLabel} className="min-w-[120px]">
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
