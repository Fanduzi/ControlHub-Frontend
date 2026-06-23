"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Lock, Play, ScrollText, Save, TriangleAlert } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import type {
  QueryExecuteResponse,
  QueryExecutionRecord,
  QueryResultCellValue,
} from "@/types/query-execution";
import {
  executeQueryTarget,
  listQueryExecutions,
  QueryExecuteError,
} from "@/services/query-executions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { QueryHistoryPanel } from "@/components/query/query-history-panel";

type QueryEditorShellProps = {
  target: QueryTarget;
};

type WorksheetTab = "worksheet" | "savedSheets" | "history" | "access";

const WORKSHEET_TABS: { id: WorksheetTab; labelKey: string }[] = [
  { id: "worksheet", labelKey: "editor.worksheetTab" },
  { id: "savedSheets", labelKey: "editor.savedSheetsTab" },
  { id: "history", labelKey: "editor.historyTab" },
  { id: "access", labelKey: "editor.accessTab" },
];

const RESULT_TABS = ["grid", "json", "explain", "logs", "masking"] as const;
type ResultTab = (typeof RESULT_TABS)[number];

const DEFAULT_STATEMENT = "select 1";
const DEFAULT_MAX_ROWS = 100;

export function QueryEditorShell({ target }: QueryEditorShellProps) {
  const t = useTranslations("queryWorkbench");
  const [activeTab, setActiveTab] = useState<WorksheetTab>("worksheet");
  const [activeResultTab, setActiveResultTab] = useState<ResultTab>("grid");

  const actions = target.availableActions;
  const canExecute = actions.run === true;

  // Execution state — local to the client. The actor is derived from the
  // verified Bearer token on the server; nothing here sends actorUserId.
  const [statement, setStatement] = useState(DEFAULT_STATEMENT);
  const [maxRows, setMaxRows] = useState(DEFAULT_MAX_ROWS);
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<QueryExecuteResponse | null>(null);
  const [error, setError] = useState<QueryExecuteError | null>(null);
  const [history, setHistory] = useState<QueryExecutionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Identity of the target this shell currently renders. Async work (execute,
  // history refresh) started for a previous target must not write back after the
  // user switches targets — otherwise a settling request from target A would
  // paint A's result/history/error under target B. Mirrored synchronously during
  // render so it is already current before any post-switch microtask resolves.
  const activeTargetIdRef = useRef(target.resourceId);
  activeTargetIdRef.current = target.resourceId;

  const refreshHistory = useCallback(async () => {
    if (!canExecute) {
      return;
    }
    const targetId = target.resourceId;
    setHistoryLoading(true);
    try {
      const response = await listQueryExecutions(targetId);
      // Drop the result if the user switched targets while this request was in
      // flight — it belongs to a target that is no longer selected.
      if (activeTargetIdRef.current !== targetId) {
        return;
      }
      setHistory(response.items);
    } catch {
      // A history load failure must never crash the worksheet. Only the current
      // target's prior history may stay; another target's history can never
      // reach here because the target-change effect clears it on switch.
      if (activeTargetIdRef.current !== targetId) {
        return;
      }
    } finally {
      if (activeTargetIdRef.current === targetId) {
        setHistoryLoading(false);
      }
    }
  }, [canExecute, target.resourceId]);

  useEffect(() => {
    // Reset every target-owned field when the selected target changes so a
    // prior target's result/error/history/progress never bleeds into the new
    // target. History reloads for the new target when it is ready.
    setResult(null);
    setError(null);
    setHistory([]);
    setIsExecuting(false);
    setHistoryLoading(false);
    if (canExecute) {
      void refreshHistory();
    }
  }, [target.resourceId, canExecute, refreshHistory]);

  const runEnabled = canExecute && !isExecuting && statement.trim() !== "";

  async function handleRun() {
    if (!runEnabled) {
      return;
    }
    const targetId = target.resourceId;
    setIsExecuting(true);
    setError(null);
    try {
      const response = await executeQueryTarget(targetId, {
        statement,
        maxRows,
      });
      // Discard the result if the user switched targets while executing — it
      // belongs to a target that is no longer selected.
      if (activeTargetIdRef.current !== targetId) {
        return;
      }
      setResult(response);
      setActiveResultTab("grid");
    } catch (caught) {
      if (activeTargetIdRef.current !== targetId) {
        return;
      }
      // The service converts every failure into a controlled QueryExecuteError.
      setResult(null);
      setError(caught instanceof QueryExecuteError ? caught : null);
    } finally {
      // Only settle this target's UI if it is still selected. If the user
      // switched targets while executing, the new target owns its own state and
      // history load — discard this attempt's aftermath entirely.
      if (activeTargetIdRef.current === targetId) {
        setIsExecuting(false);
        // Refresh history after the attempt settles (success or controlled error).
        void refreshHistory();
      }
    }
  }

  return (
    <section
      aria-label={t("editor.worksheetTab")}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card"
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/30">
        <ul role="tablist" className="flex flex-wrap">
          {WORKSHEET_TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "border-b-2 px-3 py-2 text-sm transition-colors",
                    active
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(tab.labelKey)}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="hidden items-center gap-2 pr-3 text-xs text-muted-foreground sm:flex">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            {t("editor.readonlyBadge")}
          </Badge>
          <span>{t("editor.timeout")}</span>
          <span>{t("editor.maxRows")}</span>
        </div>
      </div>

      {activeTab === "worksheet" ? (
        canExecute ? (
          <ReadyWorksheet
            statement={statement}
            onStatementChange={setStatement}
            maxRows={maxRows}
            onMaxRowsChange={setMaxRows}
            actions={actions}
            runEnabled={runEnabled}
            isExecuting={isExecuting}
            onRun={handleRun}
            result={result}
            error={error}
          />
        ) : (
          <div className="flex flex-col">
            <LockedActionBar
              run={actions.run}
              explain={actions.explain}
              exportEnabled={actions.export}
              saveSheet={actions.saveSheet}
            />

            <div className="relative border-b border-border bg-muted/20 p-4">
              <pre className="whitespace-pre-wrap font-mono text-sm text-muted-foreground/70">
                {t("editor.placeholderHint")}
              </pre>
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                <Lock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {t("editor.lockTitle")}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("editor.lockDescription")}</p>
                </div>
              </div>
            </div>

            <LockedResult activeTab={activeResultTab} onSelect={setActiveResultTab} />
          </div>
        )
      ) : activeTab === "history" && canExecute ? (
        <QueryHistoryPanel history={history} loading={historyLoading} />
      ) : (
        <PlaceholderTab tab={activeTab} />
      )}
    </section>
  );
}

function ReadyWorksheet({
  statement,
  onStatementChange,
  maxRows,
  onMaxRowsChange,
  actions,
  runEnabled,
  isExecuting,
  onRun,
  result,
  error,
}: {
  statement: string;
  onStatementChange: (value: string) => void;
  maxRows: number;
  onMaxRowsChange: (value: number) => void;
  actions: QueryTarget["availableActions"];
  runEnabled: boolean;
  isExecuting: boolean;
  onRun: () => void;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button type="button" size="sm" disabled={!runEnabled} onClick={onRun}>
          <Play className="size-3.5" aria-hidden />
          {t("editor.runReady")}
        </Button>
        <Button variant="outline" size="sm" disabled={!actions.explain}>
          <ScrollText className="size-3.5" aria-hidden />
          {t("actions.explain")}
        </Button>
        <Button variant="outline" size="sm" disabled={!actions.saveSheet}>
          <Save className="size-3.5" aria-hidden />
          {t("actions.saveSheet")}
        </Button>
        <Button variant="outline" size="sm" disabled={!actions.export}>
          <Ban className="size-3.5" aria-hidden />
          {t("actions.export")}
        </Button>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("editor.maxRowsLabel")}</span>
          <Input
            type="number"
            min={1}
            value={maxRows}
            onChange={(event) => onMaxRowsChange(Number(event.target.value))}
            aria-label={t("editor.maxRowsLabel")}
            className="h-8 w-20"
          />
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {isExecuting ? t("editor.runReady") : t("editor.ready")}
        </span>
      </div>

      <div className="border-b border-border bg-muted/20 p-3">
        <label className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("editor.statementLabel")}
        </label>
        <textarea
          value={statement}
          onChange={(event) => onStatementChange(event.target.value)}
          placeholder={t("editor.statementPlaceholder")}
          aria-label={t("editor.statementLabel")}
          spellCheck={false}
          rows={4}
          className="block w-full resize-y rounded-lg border border-border bg-background p-3 font-mono text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="p-3">
        {error ? (
          <ExecuteErrorPanel error={error} />
        ) : result ? (
          <ExecuteResult result={result} />
        ) : (
          <p className="text-sm text-muted-foreground">{t("result.notExecuted")}</p>
        )}
      </div>
    </div>
  );
}

function ExecuteResult({ result }: { result: QueryExecuteResponse }) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <dd>{t("result.rowCount", { count: result.rowCount })}</dd>
        <dd>{t("result.durationMs", { count: result.durationMs })}</dd>
        <dd>{t("result.limitApplied", { limit: result.limitApplied })}</dd>
        {result.truncated ? <dd className="font-medium text-amber-600 dark:text-amber-400">{t("result.truncated")}</dd> : null}
        <dd>
          {t("result.executionIdLabel")} {result.executionId}
        </dd>
        <dd>
          {t("result.executedAtLabel")} {result.executedAt}
        </dd>
      </dl>

      <ResultTable columns={result.columns} rows={result.rows} />
    </div>
  );
}

function ResultTable({
  columns,
  rows,
}: {
  columns: QueryExecuteResponse["columns"];
  rows: QueryExecuteResponse["rows"];
}) {
  const t = useTranslations("queryWorkbench");

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("result.noRows")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {columns.map((column) => (
              <th key={column.name} scope="col" className="px-3 py-2 font-medium">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border/60">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  <ResultCell value={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Render one JSON-safe cell. SQL NULL is preserved as an explicit, localized
 * marker — never coerced to 0, empty string, or "undefined".
 */
function ResultCell({ value }: { value: QueryResultCellValue }) {
  const t = useTranslations("queryWorkbench");

  if (value === null) {
    return (
      <span className="font-mono text-xs italic text-muted-foreground">{t("result.nullMarker")}</span>
    );
  }
  if (typeof value === "boolean") {
    return <span className="font-mono text-xs text-foreground">{value ? "true" : "false"}</span>;
  }
  return <span className="font-mono text-xs text-foreground">{String(value)}</span>;
}

function ExecuteErrorPanel({ error }: { error: QueryExecuteError }) {
  const t = useTranslations("queryWorkbench");

  return (
    <div
      role="alert"
      className="space-y-1 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {t(`error.${error.code}`)}
      </p>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium">{t("error.detailLabel")}: </span>
        {error.message}
      </p>
    </div>
  );
}

function PlaceholderTab({ tab }: { tab: Exclude<WorksheetTab, "worksheet"> }) {
  const t = useTranslations("queryWorkbench");
  const text =
    tab === "savedSheets"
      ? t("editor.savedSheetsPlaceholder")
      : tab === "history"
        ? t("editor.historyPlaceholder")
        : t("editor.accessPlaceholder");

  return (
    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
      <Lock className="size-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </div>
  );
}

function LockedActionBar({
  run,
  explain,
  exportEnabled,
  saveSheet,
}: {
  run: boolean;
  explain: boolean;
  exportEnabled: boolean;
  saveSheet: boolean;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Button variant="outline" size="sm" disabled={!run}>
        <Play className="size-3.5" aria-hidden />
        {t("actions.run")}
      </Button>
      <Button variant="outline" size="sm" disabled={!explain}>
        <ScrollText className="size-3.5" aria-hidden />
        {t("actions.explain")}
      </Button>
      <Button variant="outline" size="sm" disabled={!saveSheet}>
        <Save className="size-3.5" aria-hidden />
        {t("actions.saveSheet")}
      </Button>
      <Button variant="outline" size="sm" disabled={!exportEnabled}>
        <Ban className="size-3.5" aria-hidden />
        {t("actions.export")}
      </Button>
      <span className="ml-auto text-xs text-muted-foreground">
        {t("actionState.locked")}
      </span>
    </div>
  );
}

function LockedResult({
  activeTab,
  onSelect,
}: {
  activeTab: ResultTab;
  onSelect: (tab: ResultTab) => void;
}) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <ul role="tablist" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {RESULT_TABS.map((tab) => {
            const active = tab === activeTab;
            return (
              <li key={tab}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onSelect(tab)}
                  className={cn(
                    active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`result.${tab}`)}
                </button>
              </li>
            );
          })}
        </ul>
        <span className="text-xs text-muted-foreground">{t("result.notExecuted")}</span>
      </div>

      <div className="relative m-3 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/5 p-5">
        <div className="space-y-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {t("result.lockTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("result.lockDescription")}</p>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ResultNote label={t("result.lastQuery")} value={t("result.lastQueryValue")} />
            <ResultNote label={t("result.copyExport")} value={t("result.copyExportValue")} />
            <ResultNote label={t("result.sensitive")} value={t("result.sensitiveValue")} />
          </dl>
        </div>
      </div>
    </div>
  );
}

function ResultNote({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-xs text-foreground">{value}</dd>
    </div>
  );
}
