"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type {
  QueryExecutionRecord,
  QueryExecutionStatus,
} from "@/types/query-execution";
import { cn } from "@/lib/utils";

type HistoryPanelStatus = "idle" | "loading" | "ready" | "error";

type HistoryFilter = {
  status?: string;
  from?: string;
  to?: string;
};

type QueryHistoryPanelProps = {
  status: HistoryPanelStatus;
  items: QueryExecutionRecord[];
  error?: string;
  onRetry?: () => void;
  nextCursor: string | null;
  filter: HistoryFilter;
  isLoadingMore: boolean;
  appendError?: string;
  onApplyFilter: (filter: HistoryFilter) => void;
  onClearFilter: () => void;
  onLoadMore: () => void;
  detailExecution: QueryExecutionRecord | null;
  onOpenDetail: (execution: QueryExecutionRecord) => void;
  onCloseDetail: () => void;
};

const STATUS_TONE: Record<QueryExecutionStatus, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-amber-600 dark:text-amber-400",
  failed: "text-rose-600 dark:text-rose-400",
  timeout: "text-amber-600 dark:text-amber-400",
};

const STATUS_FILTER_VALUES = ["success", "rejected", "failed", "timeout"] as const;

function formatDuration(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms < 0) return "\u2014";
  if (ms < 1000) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms) + " ms";
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(ms / 1000) + " s";
}

function formatRowCount(count: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(count);
}

function formatRelativeTime(iso: string, locale: string, now = Date.now()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const deltaSec = Math.round((ts - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const abs = Math.abs(deltaSec);
  if (abs < 60) return rtf.format(deltaSec, "second");
  if (abs < 3600) return rtf.format(Math.round(deltaSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(deltaSec / 3600), "hour");
  return rtf.format(Math.round(deltaSec / 86400), "day");
}

function formatAbsoluteTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

function HistoryDetailSheet({ execution, onClose }: { execution: QueryExecutionRecord; onClose: () => void }) {
  const t = useTranslations("queryWorkbench");
  const locale = useLocale();
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    triggerRef.current = document.activeElement as HTMLElement;
    return () => { triggerRef.current?.focus(); };
  }, []);

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent data-side="bottom" aria-label={t("history.detail.title")}>
        <SheetHeader>
          <SheetTitle>{t("history.detail.title")}</SheetTitle>
          <SheetDescription>{execution.statementPreview || t("history.emptyStatus")}</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-3 px-4 pb-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-medium text-muted-foreground">{t("history.detail.timestamp")}</dt>
            <dd>{formatAbsoluteTime(execution.createdAt, locale)}</dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.actor")}</dt>
            <dd>{execution.actor?.displayName || t("history.unknownActor")}</dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.engine")}</dt>
            <dd>{execution.engine}</dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.status")}</dt>
            <dd><span className={cn("font-medium", STATUS_TONE[execution.status])}>{t(`history.status.${execution.status}`)}</span></dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.preview")}</dt>
            <dd><code className="break-all font-mono text-xs">{execution.statementPreview || t("history.emptyStatus")}</code></dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.rowCount")}</dt>
            <dd>{formatRowCount(execution.rowCount, locale)}</dd>
            <dt className="font-medium text-muted-foreground">{t("history.detail.duration")}</dt>
            <dd>{formatDuration(execution.durationMs, locale)}</dd>
            {(execution.errorCode || execution.errorMessage) && (
              <>
                <dt className="font-medium text-muted-foreground">{t("history.detail.error")}</dt>
                <dd className="text-rose-600 dark:text-rose-400">{[execution.errorCode, execution.errorMessage].filter(Boolean).join(": ")}</dd>
              </>
            )}
          </dl>
        </div>
        <div className="px-4 pb-4">
          <Button type="button" variant="outline" onClick={onClose}>{t("history.detail.close")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function QueryHistoryPanel({
  status, items, error, onRetry, nextCursor, filter, isLoadingMore, appendError,
  onApplyFilter, onClearFilter, onLoadMore, detailExecution, onOpenDetail, onCloseDetail,
}: QueryHistoryPanelProps) {
  const t = useTranslations("queryWorkbench");
  const locale = useLocale();

  const [localStatus, setLocalStatus] = useState(filter.status ?? "");
  const [localFrom, setLocalFrom] = useState(filter.from ?? "");
  const [localTo, setLocalTo] = useState(filter.to ?? "");

  // Controlled filter → local draft sync on external reset (Clear, target switch)
  useEffect(() => {
    setLocalStatus(filter.status ?? "");
    setLocalFrom(filter.from ?? "");
    setLocalTo(filter.to ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only on filter identity change
  }, [filter.status, filter.from, filter.to]);

  const handleApply = useCallback(() => {
    onApplyFilter({
      ...(localStatus ? { status: localStatus } : {}),
      ...(localFrom ? { from: localFrom } : {}),
      ...(localTo ? { to: localTo } : {}),
    });
  }, [localStatus, localFrom, localTo, onApplyFilter]);

  const handleClear = useCallback(() => {
    setLocalStatus("");
    setLocalFrom("");
    setLocalTo("");
    onClearFilter();
  }, [onClearFilter]);

  if (status === "idle" || status === "loading") {
    return <p className="p-4 text-sm text-muted-foreground" role="status">{t("history.loading")}</p>;
  }

  if (status === "error") {
    return (
      <div className="space-y-2 p-4" role="alert">
        <p className="text-sm text-destructive">{t("history.loadError")}</p>
        {error ? <p className="text-xs text-muted-foreground">{error}</p> : null}
        {onRetry ? <Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("history.retry")}</Button> : null}
      </div>
    );
  }

  const hasActiveFilter = Boolean(filter.status || filter.from || filter.to);

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-end gap-2" role="group" aria-label={t("history.filter.status.label")}>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-filter-status" className="text-xs text-muted-foreground">{t("history.filter.status.label")}</label>
          <Select value={localStatus || "all"} onValueChange={(v) => setLocalStatus(!v || v === "all" ? "" : v)}>
            <SelectTrigger id="history-filter-status" className="h-8 w-[140px]" aria-label={t("history.filter.status.label")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("history.filter.status.all")}</SelectItem>
              {STATUS_FILTER_VALUES.map((s) => <SelectItem key={s} value={s}>{t(`history.filter.status.${s}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-filter-from" className="text-xs text-muted-foreground">{t("history.filter.from.label")}</label>
          <Input id="history-filter-from" type="date" className="h-8 w-[150px]" value={localFrom} onChange={(e) => setLocalFrom(e.target.value)} aria-label={t("history.filter.from.label")} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="history-filter-to" className="text-xs text-muted-foreground">{t("history.filter.to.label")}</label>
          <Input id="history-filter-to" type="date" className="h-8 w-[150px]" value={localTo} onChange={(e) => setLocalTo(e.target.value)} aria-label={t("history.filter.to.label")} />
        </div>
        <Button type="button" variant="default" size="sm" onClick={handleApply}>{t("history.filter.apply")}</Button>
        {hasActiveFilter && <Button type="button" variant="outline" size="sm" onClick={handleClear}>{t("history.filter.clear")}</Button>}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.createdAt")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.actor")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.status")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.statement")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.rowCount")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.durationMs")}</th>
                <th scope="col" className="px-3 py-2 font-medium">{t("history.column.error")}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((record) => {
                const absolute = formatAbsoluteTime(record.createdAt, locale);
                return (
                  <tr
                    key={record.id}
                    className="cursor-pointer border-b border-border/60 align-top hover:bg-muted/50"
                    onClick={() => onOpenDetail(record)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenDetail(record); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={record.statementPreview || t("history.emptyStatus")}
                  >
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      <time dateTime={record.createdAt} title={absolute} aria-label={absolute}>{formatRelativeTime(record.createdAt, locale)}</time>
                    </td>
                    <td className="px-3 py-2 text-sm text-foreground">{record.actor?.displayName || t("history.unknownActor")}</td>
                    <td className="px-3 py-2"><span className={cn("font-medium", STATUS_TONE[record.status])}>{t(`history.status.${record.status}`)}</span></td>
                    <td className="max-w-[280px] px-3 py-2 sm:max-w-[360px]"><code className="break-all font-mono text-xs text-foreground line-clamp-2">{record.statementPreview || t("history.emptyStatus")}</code></td>
                    <td className="px-3 py-2 text-muted-foreground">{formatRowCount(record.rowCount, locale)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDuration(record.durationMs, locale)}</td>
                    <td className="px-3 py-2">
                      {record.errorCode || record.errorMessage ? (
                        <span className="text-xs text-rose-600 dark:text-rose-400">{[record.errorCode, record.errorMessage].filter(Boolean).join(": ")}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("history.emptyStatus")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {appendError && <p className="text-xs text-destructive" role="alert">{t("history.appendError")}</p>}

      {nextCursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={onLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? t("history.loadingMore") : t("history.loadMore")}
          </Button>
        </div>
      )}

      {detailExecution && <HistoryDetailSheet execution={detailExecution} onClose={onCloseDetail} />}
    </div>
  );
}
