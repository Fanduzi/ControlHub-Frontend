"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Lock, Play, TriangleAlert } from "lucide-react";
import type { EditorView } from "@codemirror/view";

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { QueryHistoryPanel } from "@/components/query/query-history-panel";
import { QueryGovernancePanel } from "@/components/query/query-governance-panel";
import { SqlCodeEditor } from "@/components/query/sql-code-editor";
import {
  clampEditorHeight,
  DEFAULT_QUERY_EDITOR_HEIGHT,
  normalizeEditorTheme,
  parseStoredEditorHeight,
  QUERY_EDITOR_HEIGHT_STORAGE_KEY,
} from "@/lib/query-editor-preferences";
import type { QueryEditorThemePreference } from "@/lib/query-editor-preferences";
import { formatQueryStatement } from "@/lib/query-sql-format";
import { getSchemaDatabases, getSchemaObjects } from "@/services/query-schema";
import { QueryObjectQuickNavigator } from "@/components/query/query-object-quick-navigator";
import { insertIdentifierAtSelection, objectIdentifier } from "@/lib/query-identifiers";
import type { QuerySchemaStore } from "@/lib/query-schema-store";
import type { ObjectSummary } from "@/types/query-schema";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";

type QueryEditorShellProps = {
  targets: QueryTarget[];
  activeTarget: QueryTarget;
  targetSelectionVersion: number;
  onActiveTargetChange: (resourceId: number) => void;
  onActiveDatabaseChange?: (database: string | null) => void;
  schemaStore: QuerySchemaStore;
};

type WorksheetTab = "worksheet" | "history";

const WORKSHEET_TABS: { id: WorksheetTab; labelKey: string }[] = [
  { id: "worksheet", labelKey: "editor.worksheetTab" },
  { id: "history", labelKey: "editor.historyTab" },
];

const RESULT_TABS = ["grid", "json", "explain", "logs", "masking"] as const;
type ResultTab = (typeof RESULT_TABS)[number];

const DEFAULT_STATEMENT = "select 1";
const DEFAULT_MAX_ROWS = 100;

type LocalWorksheet = {
  id: string;
  name: string;
  targetResourceId: number;
  statement: string;
  maxRows: number;
  activeResultTab: ResultTab;
  isExecuting: boolean;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
  formatError: string | null;
  history: QueryExecutionRecord[];
  historyLoading: boolean;
  requestId: string;
  activeDatabase: string | null;
  isDirty: boolean;
};

function createWorksheet(index: number, targetResourceId: number): LocalWorksheet {
  return {
    id: `worksheet-${Date.now()}-${index}`,
    name: `Worksheet ${index}`,
    targetResourceId,
    statement: DEFAULT_STATEMENT,
    maxRows: DEFAULT_MAX_ROWS,
    activeResultTab: "grid",
    isExecuting: false,
    result: null,
    error: null,
    formatError: null,
    history: [],
    historyLoading: false,
    requestId: crypto.randomUUID(),
    activeDatabase: null,
    isDirty: false,
  };
}

export function QueryEditorShell({ targets, activeTarget, targetSelectionVersion, onActiveTargetChange, onActiveDatabaseChange, schemaStore }: QueryEditorShellProps) {
  const t = useTranslations("queryWorkbench");
  const { resolvedTheme, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<WorksheetTab>("worksheet");
  const [renamingWorksheetId, setRenamingWorksheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editorHeight, setEditorHeight] = useState(DEFAULT_QUERY_EDITOR_HEIGHT);
  const [loadedDatabases, setLoadedDatabases] = useState<readonly string[]>([]);
  const [loadedObjects, setLoadedObjects] = useState<readonly ObjectSummary[]>([]);
  const [retargetDialog, setRetargetDialog] = useState<{
    open: boolean;
    worksheetId: string;
    newTargetId: number;
  } | null>(null);
  const [closeConfirmDialog, setCloseConfirmDialog] = useState<{
    open: boolean;
    worksheetId: string;
  } | null>(null);

  const [worksheets, setWorksheets] = useState<LocalWorksheet[]>(() => [
    createWorksheet(1, activeTarget.resourceId),
  ]);
  const [activeWorksheetId, setActiveWorksheetId] = useState(worksheets[0]!.id);
  const editorViewRef = useRef<EditorView | null>(null);
  const editorHeightRef = useRef(editorHeight);
  editorHeightRef.current = editorHeight;

  const activeWorksheet = worksheets.find((ws) => ws.id === activeWorksheetId) ?? worksheets[0]!;

  const targetsById = useMemo(
    () => new Map(targets.map((t) => [t.resourceId, t])),
    [targets],
  );

  // Derive execution permissions from the worksheet's own target, not the
  // parent's activeTarget. This prevents a race where switching worksheets
  // briefly uses the wrong target's availableActions.
  const worksheetTarget = targetsById.get(activeWorksheet.targetResourceId) ?? activeTarget;
  const actions = worksheetTarget.availableActions;
  const canExecute = actions.run === true;

  function updateWorksheetById(worksheetId: string, patch: Partial<LocalWorksheet>) {
    setWorksheets((previous) =>
      previous.map((ws) =>
        ws.id === worksheetId ? { ...ws, ...patch } : ws,
      ),
    );
  }

  function updateActiveWorksheet(patch: Partial<LocalWorksheet>) {
    updateWorksheetById(activeWorksheetId, patch);
  }

  function guardedUpdateWorksheet(
    worksheetId: string,
    requestId: string,
    patch: Partial<LocalWorksheet>,
  ) {
    setWorksheets((previous) => {
      const ws = previous.find((w) => w.id === worksheetId);
      if (!ws || ws.requestId !== requestId) return previous;
      return previous.map((w) =>
        w.id === worksheetId ? { ...w, ...patch } : w,
      );
    });
  }

  function addWorksheet() {
    const newIndex = worksheets.length + 1;
    const newWs = createWorksheet(newIndex, activeTarget.resourceId);
    setWorksheets((previous) => [...previous, newWs]);
    setActiveWorksheetId(newWs.id);
  }

  function requestRetarget(worksheetId: string, newTargetId: number) {
    const worksheet = worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet) return;

    // If target is the same, do nothing
    if (worksheet.targetResourceId === newTargetId) return;

    // If worksheet has SQL or is dirty, show confirmation
    if (worksheet.statement.trim() !== DEFAULT_STATEMENT.trim() || worksheet.isDirty) {
      setRetargetDialog({ open: true, worksheetId, newTargetId });
    } else {
      // Otherwise, retarget directly
      executeRetarget(worksheetId, newTargetId);
    }
  }

  function executeRetarget(worksheetId: string, newTargetId: number) {
    setWorksheets((previous) =>
      previous.map((ws) =>
        ws.id === worksheetId
          ? {
              ...ws,
              targetResourceId: newTargetId,
              activeDatabase: null,
              result: null,
              error: null,
              formatError: null,
              history: [],
              historyLoading: false,
              isExecuting: false,
              activeResultTab: "grid" as const,
              requestId: crypto.randomUUID(),
              isDirty: false,
            }
          : ws,
      ),
    );
    setRetargetDialog(null);
  }

  function closeWorksheet(id: string) {
    // Can't close last worksheet
    if (worksheets.length <= 1) return;

    const worksheet = worksheets.find((ws) => ws.id === id);
    if (!worksheet) return;

    // If worksheet has SQL or is dirty, show confirmation
    if (worksheet.statement.trim() !== DEFAULT_STATEMENT.trim() || worksheet.isDirty) {
      setCloseConfirmDialog({ open: true, worksheetId: id });
    } else {
      executeCloseWorksheet(id);
    }
  }

  function executeCloseWorksheet(id: string) {
    setWorksheets((previous) => {
      const filtered = previous.filter((ws) => ws.id !== id);
      if (activeWorksheetId === id) {
        const closedIndex = previous.findIndex((ws) => ws.id === id);
        const newActiveIndex = Math.min(closedIndex, filtered.length - 1);
        setActiveWorksheetId(filtered[newActiveIndex]!.id);
      }
      return filtered;
    });
    setCloseConfirmDialog(null);
  }

  function renameWorksheet(id: string, newName: string) {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    setWorksheets((previous) =>
      previous.map((ws) =>
        ws.id === id ? { ...ws, name: trimmed } : ws,
      ),
    );
    setRenamingWorksheetId(null);
  }

  function startRename(id: string, currentName: string) {
    setRenamingWorksheetId(id);
    setRenameValue(currentName);
  }

  const worksheetsRef = useRef(worksheets);
  worksheetsRef.current = worksheets;

  const targetsByIdRef = useRef(targetsById);
  targetsByIdRef.current = targetsById;

  const refreshHistory = useCallback(async (worksheetId?: string) => {
    const targetWorksheetId = worksheetId ?? activeWorksheetId;
    const worksheet = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
    if (!worksheet) return;

    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;

    const targetId = worksheet.targetResourceId;
    const requestId = worksheet.requestId;
    updateWorksheetById(targetWorksheetId, { historyLoading: true });

    try {
      const response = await listQueryExecutions(targetId);
      // Guard: only write history if the worksheet still targets the same resource
      // and the request hasn't been superseded.
      const currentWs = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
      if (!currentWs || currentWs.targetResourceId !== targetId || currentWs.requestId !== requestId) return;
      updateWorksheetById(targetWorksheetId, { history: response.items });
    } catch {
      // Guard: only update loading state if still valid.
      const currentWs = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
      if (!currentWs || currentWs.targetResourceId !== targetId || currentWs.requestId !== requestId) return;
    } finally {
      const currentWs = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
      if (!currentWs || currentWs.targetResourceId !== targetId || currentWs.requestId !== requestId) return;
      updateWorksheetById(targetWorksheetId, { historyLoading: false });
    }
  }, [activeWorksheetId]);

  const lastSeenVersionRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (targetSelectionVersion !== lastSeenVersionRef.current) {
      lastSeenVersionRef.current = targetSelectionVersion;

      // Create a new worksheet for the new target instead of retargeting the active one
      // This preserves the original worksheet's SQL, result, and history
      const newWs = createWorksheet(worksheetsRef.current.length + 1, activeTarget.resourceId);
      const newWorksheets = [...worksheetsRef.current, newWs];
      worksheetsRef.current = newWorksheets;
      setWorksheets(newWorksheets);
      setActiveWorksheetId(newWs.id);

      if (activeTarget.availableActions.run) {
        void refreshHistory(newWs.id);
      }
    }
  }, [targetSelectionVersion, activeTarget.resourceId, activeTarget.availableActions.run, refreshHistory]);

  useEffect(() => {
    const worksheet = worksheets.find((ws) => ws.id === activeWorksheetId);
    if (worksheet && worksheet.targetResourceId !== activeTarget.resourceId) {
      onActiveTargetChange(worksheet.targetResourceId);
    }
  }, [activeWorksheetId, activeTarget.resourceId, onActiveTargetChange, worksheets]);

  useEffect(() => {
    const worksheetId = activeWorksheet.id;
    const targetId = activeWorksheet.targetResourceId;
    if (activeWorksheet.activeDatabase !== null) return;
    if (!worksheetTarget.availableActions.run) return;
    const controller = new AbortController();
    void getSchemaDatabases(targetId, { page: 1, pageSize: 50, signal: controller.signal }).then((response) => {
      if (controller.signal.aborted) return;
      setWorksheets((previous) => previous.map((worksheet) =>
        worksheet.id === worksheetId && worksheet.targetResourceId === targetId && worksheet.activeDatabase === null
          ? { ...worksheet, activeDatabase: response.defaultDatabase }
          : worksheet,
      ));
    }, () => undefined);
    return () => controller.abort();
  }, [activeWorksheet.activeDatabase, activeWorksheet.id, activeWorksheet.targetResourceId, worksheetTarget.availableActions.run]);

  useEffect(() => {
    onActiveDatabaseChange?.(activeWorksheet.activeDatabase);
  }, [activeWorksheet.activeDatabase, onActiveDatabaseChange]);

  // Fetch databases and objects for schema-aware completion.
  // This is the single source of truth for the worksheet's schema metadata.
  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    const activeDb = activeWorksheet.activeDatabase;
    if (!worksheetTarget.availableActions.run || !activeDb) return;

    const controller = new AbortController();

    void getSchemaDatabases(targetId, { page: 1, pageSize: 100, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return;
        setLoadedDatabases(response.items.map((db) => db.name));
      },
      () => undefined,
    );

    void getSchemaObjects(targetId, { database: activeDb, page: 1, pageSize: 500, signal: controller.signal }).then(
      (response) => {
        if (controller.signal.aborted) return;
        setLoadedObjects(response.items);
      },
      () => undefined,
    );

    return () => controller.abort();
  }, [activeWorksheet.targetResourceId, activeWorksheet.activeDatabase, worksheetTarget.availableActions.run]);

  const runEnabled = canExecute && !activeWorksheet.isExecuting && activeWorksheet.statement.trim() !== "";
  const editorThemePreference = normalizeEditorTheme(
    theme === "system" ? resolvedTheme ?? "system" : theme,
  );

  useEffect(() => {
    const storedHeight = parseStoredEditorHeight(
      window.localStorage.getItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY),
    );
    if (storedHeight !== null) {
      setEditorHeight(storedHeight);
    }
  }, []);

  function handleEditorResizePointerDown(
    event: ReactPointerEvent<HTMLButtonElement>,
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startY = event.clientY;
    const startHeight = editorHeightRef.current;

    function handlePointerMove(moveEvent: PointerEvent) {
      const nextHeight = clampEditorHeight(
        startHeight + moveEvent.clientY - startY,
      );
      editorHeightRef.current = nextHeight;
      setEditorHeight(nextHeight);
    }

    function handlePointerUp() {
      window.localStorage.setItem(
        QUERY_EDITOR_HEIGHT_STORAGE_KEY,
        String(editorHeightRef.current),
      );
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  function handleEditorResizeCommit(nextHeight: number) {
    const clamped = clampEditorHeight(nextHeight);
    setEditorHeight(clamped);
    window.localStorage.setItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY, String(clamped));
  }

  async function handleRun() {
    if (!runEnabled) {
      return;
    }

    const worksheetId = activeWorksheetId;
    const targetId = activeWorksheet.targetResourceId;
    const requestId = crypto.randomUUID();

    updateActiveWorksheet({ isExecuting: true, error: null, requestId, isDirty: false });

    try {
      const response = await executeQueryTarget(targetId, {
        statement: activeWorksheet.statement,
        maxRows: activeWorksheet.maxRows,
      });

      guardedUpdateWorksheet(worksheetId, requestId, { result: response, activeResultTab: "grid" });
    } catch (caught) {
      guardedUpdateWorksheet(worksheetId, requestId, {
        result: null,
        error: caught instanceof QueryExecuteError ? caught : null,
      });
    } finally {
      guardedUpdateWorksheet(worksheetId, requestId, { isExecuting: false });
      void refreshHistory(worksheetId);
    }
  }

  function handleFormat() {
    const worksheet = activeWorksheet;
    const target = targetsById.get(worksheet.targetResourceId);
    const result = formatQueryStatement(
      target?.connectionContext.engine ?? "sql",
      worksheet.statement,
    );

    if (result.ok) {
      updateActiveWorksheet({ statement: result.formatted, formatError: null });
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.formatted },
        });
      }
    } else {
      updateActiveWorksheet({ formatError: result.error });
    }
  }

  return (
    <section
      aria-label={t("editor.worksheetTab")}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card"
    >
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-2 py-1" role="tablist" aria-label={t("editor.worksheetTab")}>
        {worksheets.map((ws) => (
          <div
            key={ws.id}
            className={cn(
              "group flex items-center rounded-t-md",
              ws.id === activeWorksheetId
                ? "bg-background border border-border border-b-transparent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {renamingWorksheetId === ws.id ? (
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => renameWorksheet(ws.id, renameValue)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    renameWorksheet(ws.id, renameValue);
                  } else if (e.key === "Escape") {
                    setRenamingWorksheetId(null);
                  }
                }}
                className="w-24 bg-transparent px-3 py-1.5 text-sm outline-none"
                autoFocus
              />
            ) : (
              <button
                type="button"
                id={`ws-tab-${ws.id}`}
                role="tab"
                aria-selected={ws.id === activeWorksheetId}
                aria-controls={`ws-panel-${ws.id}`}
                tabIndex={ws.id === activeWorksheetId ? 0 : -1}
                className="px-3 py-1.5 text-sm cursor-pointer"
                onClick={() => {
                  if (ws.id !== activeWorksheetId) {
                    setActiveWorksheetId(ws.id);
                  }
                }}
                onKeyDown={(e) => {
                  const tabs = worksheets.map((w) => w.id);
                  const currentIndex = tabs.indexOf(ws.id);
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const next = tabs[(currentIndex + 1) % tabs.length]!;
                    setActiveWorksheetId(next);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length]!;
                    setActiveWorksheetId(prev);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    setActiveWorksheetId(tabs[0]!);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    setActiveWorksheetId(tabs[tabs.length - 1]!);
                  }
                }}
                onDoubleClick={() => startRename(ws.id, ws.name)}
              >
                {ws.name}
                {ws.isDirty && (
                  <span className="ml-1 text-muted-foreground" aria-label="Unsaved changes">•</span>
                )}
              </button>
            )}
            {worksheets.length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  closeWorksheet(ws.id);
                }}
                className="pr-1 text-muted-foreground hover:text-foreground"
                aria-label={`Close ${ws.name}`}
              >
                ×
              </button>
            )}
            {renamingWorksheetId !== ws.id && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startRename(ws.id, ws.name);
                }}
                className="pr-1 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                aria-label={`Rename ${ws.name}`}
              >
                ✎
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={addWorksheet}
          className="ml-1 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label="Add worksheet"
        >
          +
        </button>
      </div>

      <div className="flex items-center justify-between border-b border-border bg-muted/30">
        <ul role="tablist" aria-label={t("editor.worksheetTab")} className="flex flex-wrap">
          {WORKSHEET_TABS.map((tab, index) => {
            const active = tab.id === activeTab;
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  id={`section-tab-${tab.id}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`section-panel-${tab.id}`}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    const tabs = WORKSHEET_TABS;
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      setActiveTab(tabs[(index + 1) % tabs.length]!.id);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      setActiveTab(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      setActiveTab(tabs[0]!.id);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      setActiveTab(tabs[tabs.length - 1]!.id);
                    }
                  }}
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

      <QueryGovernancePanel target={worksheetTarget} />
      <QueryObjectQuickNavigator
        targetId={activeWorksheet.targetResourceId}
        activeDatabase={activeWorksheet.activeDatabase}
        onDatabaseSelect={(activeDatabase) => updateActiveWorksheet({ activeDatabase })}
        onInsertObject={({ database, name }) => {
          const view = editorViewRef.current;
          if (!view) return;
          const text = objectIdentifier({ database, name, activeDatabase: activeWorksheet.activeDatabase });
          insertIdentifierAtSelection(view, text);
        }}
      />

      {activeTab === "worksheet" ? (
        canExecute ? (
          <div id="section-panel-worksheet" role="tabpanel" aria-labelledby="section-tab-worksheet">
            <ReadyWorksheet
              worksheetId={activeWorksheet.id}
              statement={activeWorksheet.statement}
              onStatementChange={(value) => updateActiveWorksheet({ statement: value })}
              maxRows={activeWorksheet.maxRows}
              onMaxRowsChange={(value) => updateActiveWorksheet({ maxRows: value })}
              runEnabled={runEnabled}
              isExecuting={activeWorksheet.isExecuting}
              onRun={handleRun}
              onFormat={handleFormat}
              onEditorView={(view) => { editorViewRef.current = view; }}
              formatError={activeWorksheet.formatError}
              engine={targetsById.get(activeWorksheet.targetResourceId)?.connectionContext.engine}
              themePreference={editorThemePreference}
              editorHeight={editorHeight}
              onEditorResizePointerDown={handleEditorResizePointerDown}
              onEditorResizeCommit={handleEditorResizeCommit}
              result={activeWorksheet.result}
              error={activeWorksheet.error}
              schemaStore={schemaStore}
              targetId={activeWorksheet.targetResourceId}
              activeDatabase={activeWorksheet.activeDatabase}
              loadedDatabases={loadedDatabases}
              loadedObjects={loadedObjects}
            />
          </div>
        ) : (
          <div id="section-panel-worksheet" role="tabpanel" aria-labelledby="section-tab-worksheet" className="flex flex-col">
            <LockedActionBar
              blockerLabelKey={actions.run ? "actions.explain" : "actionState.locked"}
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

            <LockedResult
              activeTab={activeWorksheet.activeResultTab}
              onSelect={(tab) => updateActiveWorksheet({ activeResultTab: tab })}
            />
          </div>
        )
      ) : activeTab === "history" && canExecute ? (
        <div id="section-panel-history" role="tabpanel" aria-labelledby="section-tab-history">
          <QueryHistoryPanel history={activeWorksheet.history} loading={activeWorksheet.historyLoading} />
        </div>
      ) : null}

      {/* Retarget confirmation dialog */}
      {retargetDialog?.open && (
        <AlertDialog open={retargetDialog.open} onOpenChange={(open) => !open && setRetargetDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("retarget.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("retarget.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="font-medium">{t("retarget.currentTarget")}</p>
                <p className="text-muted-foreground">
                  {targetsById.get(worksheets.find((ws) => ws.id === retargetDialog.worksheetId)?.targetResourceId ?? 0)?.displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {targetsById.get(worksheets.find((ws) => ws.id === retargetDialog.worksheetId)?.targetResourceId ?? 0)?.connectionContext.environment} • {targetsById.get(worksheets.find((ws) => ws.id === retargetDialog.worksheetId)?.targetResourceId ?? 0)?.connectionContext.engine} • {targetsById.get(worksheets.find((ws) => ws.id === retargetDialog.worksheetId)?.targetResourceId ?? 0)?.connectionContext.host}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="font-medium">{t("retarget.newTarget")}</p>
                <p className="text-muted-foreground">
                  {targetsById.get(retargetDialog.newTargetId)?.displayName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {targetsById.get(retargetDialog.newTargetId)?.connectionContext.environment} • {targetsById.get(retargetDialog.newTargetId)?.connectionContext.engine} • {targetsById.get(retargetDialog.newTargetId)?.connectionContext.host}
                </p>
                {targetsById.get(retargetDialog.newTargetId)?.connectionContext.environment === "production" && (
                  <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    {t("retarget.productionWarning")}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("retarget.clearWarning")}
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRetargetDialog(null)}>
                {t("retarget.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => executeRetarget(retargetDialog.worksheetId, retargetDialog.newTargetId)}>
                {t("retarget.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Close confirmation dialog */}
      {closeConfirmDialog?.open && (
        <AlertDialog open={closeConfirmDialog.open} onOpenChange={(open) => !open && setCloseConfirmDialog(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("close.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("close.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCloseConfirmDialog(null)}>
                {t("close.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => executeCloseWorksheet(closeConfirmDialog.worksheetId)}>
                {t("close.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </section>
  );
}

function ReadyWorksheet({
  worksheetId,
  statement,
  onStatementChange,
  maxRows,
  onMaxRowsChange,
  runEnabled,
  isExecuting,
  onRun,
  onFormat,
  onEditorView,
  formatError,
  engine,
  themePreference,
  editorHeight,
  onEditorResizePointerDown,
  onEditorResizeCommit,
  result,
  error,
  schemaStore,
  targetId,
  activeDatabase,
  loadedDatabases,
  loadedObjects,
}: {
  worksheetId: string;
  statement: string;
  onStatementChange: (value: string) => void;
  maxRows: number;
  onMaxRowsChange: (value: number) => void;
  runEnabled: boolean;
  isExecuting: boolean;
  onRun: () => void;
  onFormat: () => void;
  onEditorView?: (view: EditorView) => void;
  formatError: string | null;
  engine?: string;
  themePreference: QueryEditorThemePreference;
  editorHeight: number;
  onEditorResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEditorResizeCommit: (height: number) => void;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
  schemaStore: QuerySchemaStore;
  targetId: number;
  activeDatabase: string | null;
  loadedDatabases: readonly string[];
  loadedObjects: readonly ObjectSummary[];
}) {
  const t = useTranslations("queryWorkbench");
  const { namespace, columnFetcher } = useWorksheetSchemaAdapter(
    schemaStore,
    targetId,
    activeDatabase ?? undefined,
    loadedDatabases,
    loadedObjects,
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button type="button" size="sm" disabled={!runEnabled} onClick={onRun}>
          <Play className="size-3.5" aria-hidden />
          {t("editor.runReady")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onFormat}
          disabled={isExecuting}
        >
          {t("editor.format")}
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
        <SqlCodeEditor
          key={worksheetId}
          value={statement}
          onChange={onStatementChange}
          engine={engine}
          onRun={onRun}
          onFormat={onFormat}
          onEditorView={onEditorView}
          ariaLabel={t("editor.statementLabel")}
          disabled={isExecuting}
          themePreference={themePreference}
          height={editorHeight}
          schemaNamespace={namespace}
          columnFetcher={columnFetcher}
        />
        <button
          type="button"
          role="separator"
          aria-label={t("editor.resizeEditor")}
          aria-orientation="horizontal"
          aria-valuenow={editorHeight}
          aria-valuemin={180}
          aria-valuemax={640}
          aria-valuetext={`${editorHeight}px`}
          onKeyDown={(e) => {
            const STEP = 20;
            const MIN = 180;
            const MAX = 640;
            let nextHeight = editorHeight;
            if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
              e.preventDefault();
              nextHeight = Math.max(MIN, editorHeight - STEP);
            } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
              e.preventDefault();
              nextHeight = Math.min(MAX, editorHeight + STEP);
            } else if (e.key === "Home") {
              e.preventDefault();
              nextHeight = MIN;
            } else if (e.key === "End") {
              e.preventDefault();
              nextHeight = MAX;
            }
            if (nextHeight !== editorHeight) {
              onEditorResizeCommit(nextHeight);
            }
          }}
          onPointerDown={onEditorResizePointerDown}
          className="mt-2 flex h-3 w-full cursor-row-resize items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted/60 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="h-1 w-12 rounded-full bg-border" aria-hidden />
        </button>
        {formatError && (
          <div role="alert" className="mt-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
            <p className="text-sm text-rose-700 dark:text-rose-300">
              {formatError}
            </p>
          </div>
        )}
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

function LockedActionBar({ blockerLabelKey }: { blockerLabelKey: string }) {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
      <Badge variant="outline" className="gap-1.5 border-rose-500/30 text-rose-700 dark:text-rose-300">
        <Lock className="size-3" aria-hidden />
        {t(blockerLabelKey)}
      </Badge>
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
        <ul role="tablist" aria-label={t("result.grid")} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {RESULT_TABS.map((tab, index) => {
            const active = tab === activeTab;
            return (
              <li key={tab}>
                <button
                  type="button"
                  id={`result-tab-${tab}`}
                  role="tab"
                  aria-selected={active}
                  aria-controls={`result-panel-${tab}`}
                  tabIndex={active ? 0 : -1}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight") {
                      e.preventDefault();
                      onSelect(RESULT_TABS[(index + 1) % RESULT_TABS.length]!);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      onSelect(RESULT_TABS[(index - 1 + RESULT_TABS.length) % RESULT_TABS.length]!);
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      onSelect(RESULT_TABS[0]!);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      onSelect(RESULT_TABS[RESULT_TABS.length - 1]!);
                    }
                  }}
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

      <div
        id={`result-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`result-tab-${activeTab}`}
        className="relative m-3 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/5 p-5"
      >
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
