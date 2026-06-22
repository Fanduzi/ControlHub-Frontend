"use client";

import { useTranslations } from "next-intl";

import type {
  QueryExecutionRecord,
  QueryExecutionStatus,
} from "@/types/query-execution";
import { cn } from "@/lib/utils";

type QueryHistoryPanelProps = {
  history: QueryExecutionRecord[];
  loading: boolean;
};

const STATUS_TONE: Record<QueryExecutionStatus, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-amber-600 dark:text-amber-400",
  failed: "text-rose-600 dark:text-rose-400",
  timeout: "text-amber-600 dark:text-amber-400",
};

/**
 * Metadata-only view of recent query executions for one target. Renders digest,
 * preview, status, row count, duration, and controlled error fields — never full
 * result rows, credentials, or DSNs.
 */
export function QueryHistoryPanel({ history, loading }: QueryHistoryPanelProps) {
  const t = useTranslations("queryWorkbench");

  if (loading && history.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        {t("history.loading")}
      </p>
    );
  }

  if (history.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">{t("history.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.id")}
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
            <th scope="col" className="px-3 py-2 font-medium">
              {t("history.column.createdAt")}
            </th>
          </tr>
        </thead>
        <tbody>
          {history.map((record) => (
            <tr key={record.id} className="border-b border-border/60 align-top">
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {record.id}
              </td>
              <td className="px-3 py-2">
                <span className={cn("font-medium", STATUS_TONE[record.status])}>
                  {t(`history.status.${record.status}`)}
                </span>
              </td>
              <td className="max-w-[320px] px-3 py-2">
                <code className="font-mono text-xs text-foreground line-clamp-2 break-all">
                  {record.statementPreview || t("history.emptyStatus")}
                </code>
              </td>
              <td className="px-3 py-2 text-muted-foreground">{record.rowCount}</td>
              <td className="px-3 py-2 text-muted-foreground">{record.durationMs}</td>
              <td className="px-3 py-2">
                {record.errorCode ? (
                  <span className="text-xs text-rose-600 dark:text-rose-400">
                    {record.errorCode}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("history.emptyStatus")}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {record.createdAt}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
