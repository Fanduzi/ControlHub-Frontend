// input: query execution history records, callbacks, next-intl, Base UI controls
// output: accessible execution-history list and server-authorized statement restore action
// pos: presentation boundary for query history metadata and details
// note: if this file changes, update this header and components/query/README.md.
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
  onRestoreStatement?: (execution: QueryExecutionRecord) => void;
  restoreError?: string | null;
  isRestoringStatement?: boolean;
  restoreBlocked?: boolean;
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

function HistoryDetailSheet({
  execution,
  onClose,
  triggerRef,
  onRestoreStatement,
  restoreError,
  isRestoringStatement = false,
  restoreBlocked = false,
}: {
  execution: QueryExecutionRecord;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
  onRestoreStatement?: (execution: QueryExecutionRecord) => void;
  restoreError?: string | null;
  isRestoringStatement?: boolean;
  restoreBlocked?: boolean;
}) {
  const t = useTranslations("queryWorkbench");
  const locale = useLocale();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // WHY: Base UI's finalFocus runs on both controlled close and unmount. An
  // explicit ref is resolved without an isConnected check, so a detached row
  // (removed by filter/target/worksheet transition while the Sheet was open)
  // would receive focus onto a dead node. Returning false tells Base UI to
  // skip focus restoration entirely when the trigger is no longer connected,
  // rather than falling back to document.body.
  const finalFocus = useCallback((): HTMLElement | false | void => {
    const el = triggerRef.current;
    if (el && el.isConnected) return el;
    return false;
  }, [triggerRef]);

  // WHY: SheetContent sets initialFocus={false} globally (the resizable
  // right-side sheet does not want to steal focus on mount). The history
  // detail sheet, however, is a modal dialog that must receive focus on open
  // so screen readers announce it and keyboard users land inside the dialog.
  // Focusing the Close button explicitly gives a predictable, named landing
  // target that is also the most common next action.
  const initialFocus = useCallback((): HTMLElement | false | void => {
    return closeButtonRef.current ?? false;
  }, []);
  const canRestore = execution.canRestore;

  return (
    <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        finalFocus={finalFocus}
        initialFocus={initialFocus}
        aria-label={t("history.detail.title")}
      >
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
          {canRestore && onRestoreStatement ? (
            restoreBlocked ? (
              <p role="alert" className="mb-2 text-sm text-amber-700 dark:text-amber-300">
                {t("workspace.limitReached")}
              </p>
            ) : <>
              {restoreError ? (
                <p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-300">
                  {restoreError === "query_execution_not_found"
                    ? t("error.query_execution_not_found")
                    : t("history.restoreFailed")}
                </p>
              ) : null}
              <Button type="button" variant="outline" className="mr-2" disabled={isRestoringStatement} onClick={() => onRestoreStatement(execution)}>
                {t("history.restore")}
              </Button>
            </>
          ) : null}
          <Button type="button" variant="outline" ref={closeButtonRef} onClick={onClose}>{t("history.detail.close")}</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function QueryHistoryPanel({
  status, items, error, onRetry, nextCursor, filter, isLoadingMore, appendError,
  onApplyFilter, onClearFilter, onLoadMore, detailExecution, onOpenDetail, onCloseDetail,
  onRestoreStatement, restoreError, isRestoringStatement, restoreBlocked,
}: QueryHistoryPanelProps) {
  const t = useTranslations("queryWorkbench");
  const locale = useLocale();

  // WHY: the trigger element must be captured synchronously from the click or
  // keyboard activation event, before the Sheet mounts and Base UI moves focus
  // into the dialog. A child useEffect (the prior approach) ran AFTER Base UI
  // had already focused the dialog content, so document.activeElement pointed
  // at the dialog, not the row. This ref is component-local only — never stored
  // in worksheet persistence state (only selectedRecordId: number is persisted).
  const detailTriggerRef = useRef<HTMLElement | null>(null);

  const openDetailFromEvent = useCallback((record: QueryExecutionRecord, event: React.SyntheticEvent) => {
    detailTriggerRef.current = event.currentTarget as HTMLElement;
    onOpenDetail(record);
  }, [onOpenDetail]);

  const [localStatus, setLocalStatus] = useState(filter.status ?? "");
  const [localFrom, setLocalFrom] = useState(filter.from ?? "");
  const [localTo, setLocalTo] = useState(filter.to ?? "");

  // Controlled filter → local draft sync on external reset (Clear, target switch)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync only on filter identity change
    setLocalStatus(filter.status ?? "");
    setLocalFrom(filter.from ?? "");
    setLocalTo(filter.to ?? "");
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
                    onClick={(e) => openDetailFromEvent(record, e)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetailFromEvent(record, e); } }}
                    tabIndex={0}
                    role="button"
                    aria-haspopup="dialog"
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

      {detailExecution && (
        <HistoryDetailSheet
          execution={detailExecution}
          onClose={onCloseDetail}
          triggerRef={detailTriggerRef}
          onRestoreStatement={onRestoreStatement}
          restoreError={restoreError}
          isRestoringStatement={isRestoringStatement}
          restoreBlocked={restoreBlocked}
        />
      )}
    </div>
  );
}
