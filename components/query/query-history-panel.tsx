"use client";

import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type {
  QueryExecutionRecord,
  QueryExecutionStatus,
} from "@/types/query-execution";
import { cn } from "@/lib/utils";

type HistoryPanelStatus = "idle" | "loading" | "ready" | "error";

type QueryHistoryPanelProps = {
  status: HistoryPanelStatus;
  items: QueryExecutionRecord[];
  error?: string;
  onRetry?: () => void;
};

const STATUS_TONE: Record<QueryExecutionStatus, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-amber-600 dark:text-amber-400",
  failed: "text-rose-600 dark:text-rose-400",
  timeout: "text-amber-600 dark:text-amber-400",
};

function formatDuration(ms: number, locale: string): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(ms) + " ms";
  }
  return (
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(ms / 1000) + " s"
  );
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
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

/**
 * Metadata-only view of recent query executions for one target. Renders actor
 * display name, status, statement preview, rows, duration, and controlled
 * errors — never full result rows, credentials, DSNs, or raw actor IDs.
 */
export function QueryHistoryPanel({
  status,
  items,
  error,
  onRetry,
}: QueryHistoryPanelProps) {
  const t = useTranslations("queryWorkbench");
  const locale = useLocale();

  if (status === "idle" || status === "loading") {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        {t("history.loading")}
      </p>
    );
  }

  if (status === "error") {
    return (
      <div className="space-y-2 p-4" role="alert">
        <p className="text-sm text-destructive">{t("history.loadError")}</p>
        {error ? (
          <p className="text-xs text-muted-foreground">{error}</p>
        ) : null}
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            {t("history.retry")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("history.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.createdAt")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.actor")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.status")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.statement")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.rowCount")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.durationMs")}
            </th>
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.error")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((record) => {
            const absolute = formatAbsoluteTime(record.createdAt, locale);
            return (
              <tr key={record.id} className="border-b border-border/60 align-top">
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  <time dateTime={record.createdAt} title={absolute} aria-label={absolute}>
                    {formatRelativeTime(record.createdAt, locale)}
                  </time>
                </td>
                <td className="px-3 py-2 text-sm text-foreground">
                  {record.actor?.displayName || t("history.unknownActor")}
                </td>
                <td className="px-3 py-2">
                  <span className={cn("font-medium", STATUS_TONE[record.status])}>
                    {t(`history.status.${record.status}`)}
                  </span>
                </td>
                <td className="max-w-[280px] px-3 py-2 sm:max-w-[360px]">
                  <code className="break-all font-mono text-xs text-foreground line-clamp-2">
                    {record.statementPreview || t("history.emptyStatus")}
                  </code>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatRowCount(record.rowCount, locale)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {formatDuration(record.durationMs, locale)}
                </td>
                <td className="px-3 py-2">
                  {record.errorCode || record.errorMessage ? (
                    <span className="text-xs text-rose-600 dark:text-rose-400">
                      {[record.errorCode, record.errorMessage].filter(Boolean).join(": ")}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t("history.emptyStatus")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
