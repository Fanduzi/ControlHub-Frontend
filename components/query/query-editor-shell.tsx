// input: @/components/query/*, @/services/*, @/types/*, @/lib/*, lucide-react, next-intl, next-themes
// output: QueryEditorShell UI adapter over WorksheetSession + schema catalog
// pos: paints worksheets; session owns run/template/explain, catalog owns 库身份 metadata
// note: if this file changes, update header and components/query/README.md
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Copy, Download, ListTree, Lock, Play, SearchCode, TriangleAlert } from "lucide-react";
import type { EditorView } from "@codemirror/view";

import type { QueryTarget } from "@/types/query-target";
import type {
  QueryExecutePaginationResponse,
  QueryExecuteResponse,
  QueryExecutionFilter,
  QueryExecutionRecord,
  QueryResultCellValue,
  QueryResultColumn,
  QueryExecutionStatus,
  TablePreviewRequest,
} from "@/types/query-execution";
import type { QuerySavedStatementParameterDefinition, QuerySavedStatementRecord } from "@/types/query-saved-statement";
import { QueryExecuteError, getQueryExecutionStatement, isRetryableControlledErrorCode } from "@/services/query-executions";
import { getQueryWorkspace, putQueryWorkspace } from "@/services/query-workspace";
import type { QueryWorkspaceWorksheet } from "@/types/query-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { QuerySavedStatements } from "@/components/query/query-saved-statements";
import { SqlCodeEditor } from "@/components/query/sql-code-editor";
import {
  clampEditorHeight,
  DEFAULT_QUERY_EDITOR_HEIGHT,
  normalizeEditorTheme,
  normalizeMaxRows,
  parseMaxRowsDraft,
  parseStoredEditorHeight,
  QUERY_EDITOR_HEIGHT_STORAGE_KEY,
  getMaxRows,
  setMaxRows as persistMaxRows,
  getPageSize,
  setPageSize as persistPageSize,
  QUERY_RESULT_PAGE_SIZES,
} from "@/lib/query-editor-preferences";
import type { QueryEditorThemePreference } from "@/lib/query-editor-preferences";
import { formatQueryStatement } from "@/lib/query-sql-format";
import { QueryObjectQuickNavigator } from "@/components/query/query-object-quick-navigator";
import { insertIdentifierAtSelection, objectIdentifier } from "@/lib/query-identifiers";
import {
  COMPLETION_PAGE_SIZE,
  useSchemaCatalogVersion,
  type QuerySchemaStore,
} from "@/lib/query-schema-store";
import type { ForeignKeyDetail } from "@/types/query-schema";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";
import { copyToClipboard } from "@/lib/clipboard";
import { serializeQueryResultCsv } from "@/lib/query-result-csv";
import { normalizeExecuteResponse } from "@/lib/query-result-envelope";
import {
  DEFAULT_STATEMENT,
  INITIAL_WORKSHEET_ID,
  MAX_WORKSHEETS,
  WorksheetSession,
  useWorksheetSessionVersion,
  type ExplainState,
  type PreviewProvenance,
  type RelatedRecordsState,
} from "@/lib/worksheet-session";

type QueryEditorShellProps = {
  targets: QueryTarget[];
  activeTarget: QueryTarget;
  targetSelectionVersion: number;
  onActiveTargetChange: (resourceId: number) => void;
  onActiveDatabaseChange?: (database: string | null) => void;
  schemaStore: QuerySchemaStore;
  pendingPreviewEvent?: { id: number; request: TablePreviewRequest } | null;
  onPreviewConsumed?: () => void;
};

type WorksheetTab = "worksheet" | "history" | "savedStatements";

const WORKSHEET_TABS: { id: WorksheetTab; labelKey: string }[] = [
  { id: "worksheet", labelKey: "editor.worksheetTab" },
  { id: "history", labelKey: "editor.historyTab" },
  { id: "savedStatements", labelKey: "editor.savedSheetsTab" },
];

const HISTORY_STATUS_OPTIONS: readonly QueryExecutionStatus[] = [
  "success",
  "rejected",
  "failed",
  "timeout",
];

type NavigationCapability = {
  readonly sourceDatabase: string;
  readonly sourceObject: string;
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
  readonly onNavigate: (foreignKey: string, localValues: readonly string[]) => void;
};

export function QueryEditorShell({ targets, activeTarget, targetSelectionVersion, onActiveTargetChange, onActiveDatabaseChange, schemaStore, pendingPreviewEvent, onPreviewConsumed }: QueryEditorShellProps) {
  const t = useTranslations("queryWorkbench");
  const { resolvedTheme, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<WorksheetTab>("worksheet");
  const [renamingWorksheetId, setRenamingWorksheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editorHeight, setEditorHeight] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_QUERY_EDITOR_HEIGHT;
    return parseStoredEditorHeight(window.localStorage.getItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY))
      ?? DEFAULT_QUERY_EDITOR_HEIGHT;
  });
  const [metadataRetryKey, setMetadataRetryKey] = useState(0);
  const catalogVersion = useSchemaCatalogVersion(schemaStore);
  const [retargetDialog, setRetargetDialog] = useState<{
    open: boolean;
    worksheetId: string;
    newTargetId: number;
  } | null>(null);
  const [closeConfirmDialog, setCloseConfirmDialog] = useState<{
    open: boolean;
    worksheetId: string;
  } | null>(null);

  const [session] = useState(
    () => new WorksheetSession({ initialTargetId: activeTarget.resourceId }),
  );
  useWorksheetSessionVersion(session);
  const worksheets = session.list;
  const activeWorksheetId = session.activeId;
  const activeWorksheet = session.active;
  const [workspaceVersion, setWorkspaceVersion] = useState<number | null>(null);
  const [workspaceProblem, setWorkspaceProblem] = useState<"load" | "save" | null>(null);
  const [workspaceConflict, setWorkspaceConflict] = useState(false);
  const [worksheetLimitReached, setWorksheetLimitReached] = useState(false);
  const [historyRestoreError, setHistoryRestoreError] = useState<string | null>(null);
  const [isRestoringHistoryStatement, setIsRestoringHistoryStatement] = useState(false);
  const savedWorkspaceSignatureRef = useRef<string | null>(null);
  const workspaceSaveInFlightRef = useRef(false);
  const queuedWorkspaceSaveRef = useRef<{
    signature: string;
    worksheets: readonly QueryWorkspaceWorksheet[];
  } | null>(null);
  const localWorkspaceChangedRef = useRef(false);
  const activeTargetRef = useRef(activeTarget);
  activeTargetRef.current = activeTarget;
  const workspaceWorksheets = session.persistedSnapshot();
  const workspaceSignature = JSON.stringify(workspaceWorksheets);

  const loadWorkspace = useCallback(async (replaceEmpty = false) => {
    try {
      const workspace = await getQueryWorkspace();
      if (!replaceEmpty && workspace.worksheets.length > 0 && localWorkspaceChangedRef.current) {
        setWorkspaceVersion(workspace.version);
        setWorkspaceProblem(null);
        setWorkspaceConflict(true);
        return;
      }
      if (workspace.worksheets.length > 0 || replaceEmpty) {
        session.hydrate(workspace.worksheets, activeTargetRef.current.resourceId);
        savedWorkspaceSignatureRef.current = JSON.stringify(session.persistedSnapshot());
      } else {
        savedWorkspaceSignatureRef.current = "[]";
      }
      setWorkspaceVersion(workspace.version);
      setWorkspaceProblem(null);
      setWorkspaceConflict(false);
      localWorkspaceChangedRef.current = false;
    } catch {
      setWorkspaceProblem("load");
    }
  }, [session]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const saveWorkspace = useCallback(function persistWorkspace(
    version: number,
    signature: string,
    snapshot: readonly QueryWorkspaceWorksheet[],
  ): void {
    if (workspaceSaveInFlightRef.current) {
      queuedWorkspaceSaveRef.current = { signature, worksheets: snapshot };
      return;
    }

    workspaceSaveInFlightRef.current = true;
    void putQueryWorkspace(version, snapshot).then(
      (workspace) => {
        savedWorkspaceSignatureRef.current = signature;
        setWorkspaceVersion(workspace.version);
        setWorkspaceProblem(null);

        const queued = queuedWorkspaceSaveRef.current;
        queuedWorkspaceSaveRef.current = null;
        workspaceSaveInFlightRef.current = false;
        if (queued && queued.signature !== signature) {
          persistWorkspace(workspace.version, queued.signature, queued.worksheets);
        }
      },
      (error: unknown) => {
        queuedWorkspaceSaveRef.current = null;
        workspaceSaveInFlightRef.current = false;
        if (error instanceof QueryExecuteError && error.code === "query_workspace_conflict") {
          setWorkspaceConflict(true);
          return;
        }
        setWorkspaceProblem("save");
      },
    );
  }, []);

  useEffect(() => {
    if (
      workspaceVersion === null ||
      workspaceProblem !== null ||
      workspaceConflict ||
      savedWorkspaceSignatureRef.current === workspaceSignature
    ) return;

    const timer = window.setTimeout(() => {
      saveWorkspace(workspaceVersion, workspaceSignature, workspaceWorksheets);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [saveWorkspace, workspaceConflict, workspaceProblem, workspaceSignature, workspaceVersion, workspaceWorksheets]);
  const activeMaxRowsDraftValidityRef = useRef({
    worksheetId: INITIAL_WORKSHEET_ID,
    valid: true,
  });
  const editorViewRef = useRef<EditorView | null>(null);
  const editorHeightRef = useRef(editorHeight);
  useEffect(() => {
    editorHeightRef.current = editorHeight;
  }, [editorHeight]);

  useEffect(() => {
    activeMaxRowsDraftValidityRef.current = {
      worksheetId: activeWorksheetId,
      valid: true,
    };
  }, [activeWorksheetId]);

  const targetsById = useMemo(
    () => new Map(targets.map((t) => [t.resourceId, t])),
    [targets],
  );

  // Derive execution permissions from the worksheet's own target, not the
  // parent's activeTarget. This prevents a race where switching worksheets
  // briefly uses the wrong target's availableActions.
  const worksheetTarget = targetsById.get(activeWorksheet.targetResourceId) ?? null;
  const actions = worksheetTarget?.availableActions;
  const canExecute = actions?.run === true;

  function activeMaxRowsDraftIsValid(): boolean {
    const tracked = activeMaxRowsDraftValidityRef.current;
    return tracked.worksheetId !== activeWorksheetId || tracked.valid;
  }

  const activateWorksheet = useCallback((worksheetId: string) => {
    session.activate(worksheetId);
  }, [session]);

  function replaceActiveStatement(
    statement: string,
    parameters: readonly QuerySavedStatementParameterDefinition[] = [],
    formatError: string | null = null,
  ) {
    localWorkspaceChangedRef.current = true;
    session.replaceStatement(statement, parameters, formatError);
  }

  function loadSavedStatement(item: QuerySavedStatementRecord) {
    localWorkspaceChangedRef.current = true;
    session.loadSavedStatement(item);
  }

  function addWorksheet() {
    if (session.list.length >= MAX_WORKSHEETS) {
      setWorksheetLimitReached(true);
      return;
    }
    localWorkspaceChangedRef.current = true;
    session.add(activeTarget.resourceId);
  }

  function executeRetarget(worksheetId: string, newTargetId: number) {
    localWorkspaceChangedRef.current = true;
    session.retarget(worksheetId, newTargetId);
    setRetargetDialog(null);
  }

  function closeWorksheet(id: string) {
    if (worksheets.length <= 1) return;
    const worksheet = worksheets.find((ws) => ws.id === id);
    if (!worksheet) return;
    if (worksheet.statement.trim() !== DEFAULT_STATEMENT.trim() || worksheet.isDirty) {
      setCloseConfirmDialog({ open: true, worksheetId: id });
    } else {
      executeCloseWorksheet(id);
    }
  }

  function executeCloseWorksheet(id: string) {
    localWorkspaceChangedRef.current = true;
    session.close(id);
    setCloseConfirmDialog(null);
  }

  function renameWorksheet(id: string, newName: string) {
    localWorkspaceChangedRef.current = true;
    session.rename(id, newName);
    setRenamingWorksheetId(null);
  }

  function startRename(id: string, currentName: string) {
    setRenamingWorksheetId(id);
    setRenameValue(currentName);
  }

  const targetsByIdRef = useRef(targetsById);
  useEffect(() => {
    targetsByIdRef.current = targetsById;
  }, [targetsById]);

  const refreshHistory = useCallback(async (worksheetId?: string, requestedFilters?: QueryExecutionFilter) => {
    const worksheet = session.list.find((ws) => ws.id === (worksheetId ?? session.activeId));
    if (!worksheet) return;
    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;
    await session.refreshHistory(worksheet.id, requestedFilters);
  }, [session]);

  const loadMoreHistory = useCallback(async (worksheetId?: string) => {
    const worksheet = session.list.find((ws) => ws.id === (worksheetId ?? session.activeId));
    if (!worksheet) return;
    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;
    await session.loadMoreHistory(worksheet.id);
  }, [session]);

  function applyFilters(filters: QueryExecutionFilter) {
    session.applyFilters(filters);
  }

  function clearFilters() {
    session.applyFilters({});
  }

  function openHistoryDetail(record: QueryExecutionRecord) {
    session.openHistoryDetail(record.id);
  }

  function closeHistoryDetail() {
    setHistoryRestoreError(null);
    session.closeHistoryDetail();
  }

  async function restoreHistoryStatement(record: QueryExecutionRecord) {
    if (!record.canRestore || isRestoringHistoryStatement) return;
    const sourceWorksheet = session.active;
    if (session.list.length >= MAX_WORKSHEETS) {
      setWorksheetLimitReached(true);
      return;
    }
    setHistoryRestoreError(null);
    setIsRestoringHistoryStatement(true);
    try {
      const response = await getQueryExecutionStatement(
        record.targetResourceId,
        record.id,
      );
      if (session.list.length >= MAX_WORKSHEETS) {
        setWorksheetLimitReached(true);
        return;
      }
      localWorkspaceChangedRef.current = true;
      const restored = session.restoreDraft({
        targetId: sourceWorksheet.targetResourceId,
        statement: response.statement,
        activeDatabase: sourceWorksheet.activeDatabase,
      });
      if (!restored) {
        setWorksheetLimitReached(true);
        return;
      }
      setActiveTab("worksheet");
    } catch (error) {
      setHistoryRestoreError(
        error instanceof QueryExecuteError ? error.code : "internal_error",
      );
    } finally {
      setIsRestoringHistoryStatement(false);
    }
  }

  function selectWorksheetTab(tab: WorksheetTab) {
    setActiveTab(tab);
    if (tab !== "history") return;
    const worksheet = session.active;
    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;
    if (worksheet.history.replaceStatus === "idle" || worksheet.history.replaceStatus === "error") {
      void refreshHistory(worksheet.id);
    }
  }

  const lastSeenVersionRef = useRef(targetSelectionVersion);

  useEffect(() => {
    if (targetSelectionVersion === lastSeenVersionRef.current) {
      return;
    }
    lastSeenVersionRef.current = targetSelectionVersion;
    if (session.list.length >= MAX_WORKSHEETS) {
      setWorksheetLimitReached(true);
      return;
    }
    localWorkspaceChangedRef.current = true;
    const opened = session.openForTarget(activeTarget.resourceId);
    if (!opened) setWorksheetLimitReached(true);
  }, [targetSelectionVersion, activeTarget.resourceId, session]);

  const lastPreviewIdRef = useRef(0);
  useEffect(() => {
    if (!pendingPreviewEvent || pendingPreviewEvent.id === lastPreviewIdRef.current) {
      return;
    }
    lastPreviewIdRef.current = pendingPreviewEvent.id;
    onPreviewConsumed?.();
    const { request } = pendingPreviewEvent;
    if (request.targetId !== activeTarget.resourceId) {
      return;
    }
    if (session.list.length >= MAX_WORKSHEETS) {
      setWorksheetLimitReached(true);
      return;
    }
    localWorkspaceChangedRef.current = true;
    session.openPreview({
      targetId: request.targetId,
      database: request.database,
      table: request.table,
      foreignKeys: request.foreignKeys,
      foreignKeysTruncated: request.foreignKeysTruncated,
    });
  }, [pendingPreviewEvent, onPreviewConsumed, activeTarget.resourceId, session]);

  useEffect(() => {
    if (activeWorksheet.targetResourceId !== activeTarget.resourceId) {
      onActiveTargetChange(activeWorksheet.targetResourceId);
    }
  }, [activeWorksheet.targetResourceId, activeTarget.resourceId, onActiveTargetChange]);

  const applyDefaultToNullWorksheets = useCallback((targetId: number, defaultDb: string | null): void => {
    session.applyDefaultDatabase(targetId, defaultDb);
  }, [session]);

  const completionTargetId = activeWorksheet.targetResourceId;
  const completionDatabase = activeWorksheet.activeDatabase;
  const databaseListing = schemaStore.getDatabases(completionTargetId, COMPLETION_PAGE_SIZE);
  const objectListing = completionDatabase
    ? schemaStore.getObjects(completionTargetId, completionDatabase, COMPLETION_PAGE_SIZE, "")
    : { items: [], pageInfo: null, status: "idle" as const };
  const metadataError = databaseListing.status === "error" || objectListing.status === "error";

  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    if (!worksheetTarget?.availableActions.run) return;
    const controller = new AbortController();
    const databases = schemaStore.getDatabases(targetId, COMPLETION_PAGE_SIZE);
    if (databases.status === "idle" || databases.status === "error") {
      void schemaStore.ensureDatabases(targetId, {
        page: 1,
        pageSize: COMPLETION_PAGE_SIZE,
        replace: true,
        signal: controller.signal,
      });
    }
    return () => controller.abort();
  }, [activeWorksheet.targetResourceId, metadataRetryKey, schemaStore, worksheetTarget?.availableActions.run]);

  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    const defaultDb = schemaStore.getDefaultDatabase(targetId);
    if (activeWorksheet.activeDatabase === null && defaultDb) {
      applyDefaultToNullWorksheets(targetId, defaultDb);
    }
  }, [
    activeWorksheet.activeDatabase,
    activeWorksheet.targetResourceId,
    applyDefaultToNullWorksheets,
    catalogVersion,
    schemaStore,
  ]);

  const effectiveCompletionDatabase =
    activeWorksheet.activeDatabase ?? schemaStore.getDefaultDatabase(activeWorksheet.targetResourceId);

  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    if (!worksheetTarget?.availableActions.run || !effectiveCompletionDatabase) return;
    const controller = new AbortController();
    const objects = schemaStore.getObjects(
      targetId,
      effectiveCompletionDatabase,
      COMPLETION_PAGE_SIZE,
      "",
    );
    if (objects.status === "idle" || objects.status === "error") {
      void schemaStore.ensureObjects(targetId, effectiveCompletionDatabase, {
        page: 1,
        pageSize: COMPLETION_PAGE_SIZE,
        replace: true,
        signal: controller.signal,
      });
    }
    return () => controller.abort();
  }, [
    activeWorksheet.targetResourceId,
    effectiveCompletionDatabase,
    metadataRetryKey,
    schemaStore,
    worksheetTarget?.availableActions.run,
  ]);

  function retryMetadata() {
    const targetId = activeWorksheet.targetResourceId;
    schemaStore.invalidateDatabases(targetId, COMPLETION_PAGE_SIZE);
    if (activeWorksheet.activeDatabase) {
      schemaStore.invalidateObjects(targetId, activeWorksheet.activeDatabase, COMPLETION_PAGE_SIZE, "");
    }
    setMetadataRetryKey((key) => key + 1);
  }

  useEffect(() => {
    onActiveDatabaseChange?.(activeWorksheet.activeDatabase);
  }, [activeWorksheet.activeDatabase, onActiveDatabaseChange]);

  const templateMode = activeWorksheet.templateStatementId !== null;
  const templateValuesReady =
    !templateMode ||
    activeWorksheet.parameters.every(
      (parameter) => (activeWorksheet.parameterValues[parameter.name] ?? "").trim() !== "",
    );
  const runEnabled =
    canExecute && !activeWorksheet.isExecuting && activeWorksheet.statement.trim() !== "" && templateValuesReady;

  function handleParameterValueChange(name: string, value: string) {
    session.setParameterValue(name, value);
  }

  const editorThemePreference = normalizeEditorTheme(
    theme === "system" ? resolvedTheme ?? "system" : theme,
  );

  // Restore the persisted paging preferences after hydration, before any
  // execution can happen. Both are per-worksheet state seeded from storage.
  useEffect(() => {
    session.setPageSizeAll(getPageSize());
  }, [session]);

  useEffect(() => {
    session.setMaxRowsAll(getMaxRows());
  }, [session]);

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

  function handleRelatedRecordsNavigate(foreignKey: string, localValues: readonly string[]) {
    session.navigateRelated(foreignKey, localValues);
  }

  function handleCloseRelatedRecords() {
    session.closeRelatedRecords();
  }

  async function handleRun() {
    if (!runEnabled || !activeMaxRowsDraftIsValid()) {
      return;
    }
    await session.run();
    void refreshHistory(session.activeId);
  }

  async function handleNextPage() {
    if (!activeMaxRowsDraftIsValid()) return;
    await session.nextPage();
  }

  async function handlePreviousPage() {
    if (!activeMaxRowsDraftIsValid()) return;
    await session.previousPage();
  }

  async function handlePageSizeChange(newSize: number) {
    if (!activeMaxRowsDraftIsValid()) return;
    const validPageSize = QUERY_RESULT_PAGE_SIZES.find((value) => value === newSize);
    if (validPageSize === undefined) return;
    persistPageSize(validPageSize);
    await session.changePageSize(validPageSize);
  }

  async function handleExplain() {
    if (actions?.explain !== true) return;
    await session.explain();
  }

  function handleCloseExplain() {
    session.closeExplain();
  }

  function handleFormat() {
    localWorkspaceChangedRef.current = true;
    const worksheet = session.active;
    const target = targetsById.get(worksheet.targetResourceId);
    const result = formatQueryStatement(
      target?.connectionContext.engine ?? "sql",
      worksheet.statement,
    );
    if (result.ok) {
      session.applyFormat(result.formatted, null);
      const view = editorViewRef.current;
      if (view) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: result.formatted },
        });
      }
    } else {
      session.applyFormat(worksheet.statement, result.error);
    }
  }


  return (
    <section
      aria-label={t("editor.worksheetTab")}
      className="flex min-w-0 flex-col rounded-xl border border-border bg-card"
    >
      {workspaceConflict ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <span>{t("error.query_workspace_conflict")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadWorkspace(true)}>
            {t("workspace.reload")}
          </Button>
        </div>
      ) : workspaceProblem ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-rose-500/40 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          <span>{t(`workspace.${workspaceProblem}Error`)}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => workspaceProblem === "load" ? void loadWorkspace() : setWorkspaceProblem(null)}
          >
            {t("workspace.retry")}
          </Button>
        </div>
      ) : null}
      {worksheetLimitReached ? (
        <p role="alert" className="border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {t("workspace.limitReached")}
        </p>
      ) : null}
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
                    activateWorksheet(ws.id);
                  }
                }}
                onKeyDown={(e) => {
                  const tabs = worksheets.map((w) => w.id);
                  const currentIndex = tabs.indexOf(ws.id);
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const next = tabs[(currentIndex + 1) % tabs.length]!;
                    activateWorksheet(next);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const prev = tabs[(currentIndex - 1 + tabs.length) % tabs.length]!;
                    activateWorksheet(prev);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    activateWorksheet(tabs[0]!);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    activateWorksheet(tabs[tabs.length - 1]!);
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
                      selectWorksheetTab(tabs[(index + 1) % tabs.length]!.id);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      selectWorksheetTab(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
                    } else if (e.key === "Home") {
                      e.preventDefault();
                      selectWorksheetTab(tabs[0]!.id);
                    } else if (e.key === "End") {
                      e.preventDefault();
                      selectWorksheetTab(tabs[tabs.length - 1]!.id);
                    }
                  }}
                  onClick={() => selectWorksheetTab(tab.id)}
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

      {worksheetTarget ? (
        <>
          <QueryGovernancePanel target={worksheetTarget} />
          <QueryObjectQuickNavigator
            catalog={schemaStore}
            targetId={activeWorksheet.targetResourceId}
            activeDatabase={activeWorksheet.activeDatabase}
            onDatabaseSelect={(activeDatabase) => {
              localWorkspaceChangedRef.current = true;
              session.setActiveDatabase(activeDatabase);
            }}
            onInsertObject={({ database, name }) => {
              const view = editorViewRef.current;
              if (!view) return;
              const text = objectIdentifier({ database, name, activeDatabase: activeWorksheet.activeDatabase });
              insertIdentifierAtSelection(view, text);
            }}
          />
        </>
      ) : (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <span>{t("workspace.targetUnavailable")}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRetargetDialog({
              open: true,
              worksheetId: activeWorksheet.id,
              newTargetId: activeTarget.resourceId,
            })}
          >
            {t("workspace.retargetTo", { target: activeTarget.displayName })}
          </Button>
        </div>
      )}

      {activeTab === "worksheet" ? (
        canExecute ? (
          <div id="section-panel-worksheet" role="tabpanel" aria-labelledby="section-tab-worksheet">
            <ReadyWorksheet
              worksheetId={activeWorksheet.id}
              statement={activeWorksheet.statement}
              onStatementChange={(value) => {
                replaceActiveStatement(value);
              }}
              parameters={activeWorksheet.parameters}
              parameterValues={activeWorksheet.parameterValues}
              onParameterValueChange={handleParameterValueChange}
              templateMode={templateMode}
              templateFieldErrors={activeWorksheet.templateFieldErrors}
              maxRows={activeWorksheet.maxRows}
              onMaxRowsChange={(value) => {
                const next = normalizeMaxRows(value, activeWorksheet.maxRows);
                persistMaxRows(next);
                session.setMaxRows(activeWorksheet.id, next);
              }}
              onMaxRowsDraftValidityChange={(valid) => {
                activeMaxRowsDraftValidityRef.current = {
                  worksheetId: activeWorksheetId,
                  valid,
                };
              }}
              runEnabled={runEnabled}
              isExecuting={activeWorksheet.isExecuting}
              onRun={handleRun}
              explainEnabled={
                !templateMode &&
                actions?.explain === true &&
                activeWorksheet.statement.trim() !== ""
              }
              exportEnabled={actions?.export === true}
              explainState={activeWorksheet.explain}
              onExplain={handleExplain}
              onCloseExplain={handleCloseExplain}
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
              metadataError={metadataError}
              onRetryMetadata={retryMetadata}
              previewProvenance={activeWorksheet.previewProvenance}
              relatedRecords={activeWorksheet.relatedRecords}
              onRelatedRecordsNavigate={handleRelatedRecordsNavigate}
              onCloseRelatedRecords={handleCloseRelatedRecords}
              currentPage={activeWorksheet.currentPage}
              resultPagination={activeWorksheet.resultPagination}
              pageSize={activeWorksheet.pageSize}
              onNextPage={handleNextPage}
              onPreviousPage={handlePreviousPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </div>
        ) : (
          <div id="section-panel-worksheet" role="tabpanel" aria-labelledby="section-tab-worksheet" className="flex flex-col">
            <LockedActionBar
              blockerLabelKey={actions?.run ? "actions.explain" : "actionState.locked"}
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

            <LockedResult />
          </div>
        )
      ) : activeTab === "history" && canExecute ? (
        <div id="section-panel-history" role="tabpanel" aria-labelledby="section-tab-history">
          <QueryHistoryPanel
            status={activeWorksheet.history.replaceStatus}
            items={activeWorksheet.history.items}
            error={activeWorksheet.history.replaceError}
            onRetry={() => {
              void refreshHistory(activeWorksheet.id);
            }}
            nextCursor={activeWorksheet.history.nextCursor}
            filter={activeWorksheet.history.pendingFilters}
            isLoadingMore={activeWorksheet.history.appendStatus === "loading"}
            appendError={activeWorksheet.history.appendError}
            onApplyFilter={(filter) => {
              const status = HISTORY_STATUS_OPTIONS.find((option) => option === filter.status);
              applyFilters({
                ...(status ? { status } : {}),
                ...(filter.from ? { from: filter.from } : {}),
                ...(filter.to ? { to: filter.to } : {}),
              });
            }}
            onClearFilter={clearFilters}
            onLoadMore={() => void loadMoreHistory(activeWorksheet.id)}
            detailExecution={activeWorksheet.history.items.find(
              (item) => item.id === activeWorksheet.history.selectedRecordId,
            ) ?? null}
            onOpenDetail={openHistoryDetail}
            onCloseDetail={closeHistoryDetail}
            onRestoreStatement={restoreHistoryStatement}
            restoreError={historyRestoreError}
            isRestoringStatement={isRestoringHistoryStatement}
            restoreBlocked={worksheets.length >= MAX_WORKSHEETS}
          />
        </div>
      ) : activeTab === "savedStatements" && worksheetTarget ? (
        <div id="section-panel-savedStatements" role="tabpanel" aria-labelledby="section-tab-savedStatements">
          <QuerySavedStatements
            targetResourceId={activeWorksheet.targetResourceId}
            currentStatement={activeWorksheet.statement}
            onStatementLoad={loadSavedStatement}
          />
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
                  {(() => {
                    const retargetWorksheet = worksheets.find((ws) => ws.id === retargetDialog.worksheetId);
                    const retargetCurrentTarget = targetsById.get(retargetWorksheet?.targetResourceId ?? 0);
                    return retargetCurrentTarget?.displayName ?? t("workspace.unavailableTargetLabel", {
                      id: String(retargetWorksheet?.targetResourceId ?? ""),
                    });
                  })()}
                </p>
                {(() => {
                  const retargetCurrentTarget = targetsById.get(
                    worksheets.find((ws) => ws.id === retargetDialog.worksheetId)?.targetResourceId ?? 0,
                  );
                  return retargetCurrentTarget ? (
                    <p className="text-xs text-muted-foreground">
                      {retargetCurrentTarget.connectionContext.environment} • {retargetCurrentTarget.connectionContext.engine} • {retargetCurrentTarget.connectionContext.host}
                    </p>
                  ) : null;
                })()}
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

function WorksheetParameterInputs({
  worksheetId,
  parameters,
  parameterValues,
  fieldErrors,
  onParameterValueChange,
  t,
}: {
  worksheetId: string;
  parameters: readonly QuerySavedStatementParameterDefinition[];
  parameterValues: Record<string, string>;
  fieldErrors: Record<string, string>;
  onParameterValueChange: (name: string, value: string) => void;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  if (parameters.length === 0) return null;

  function fieldErrorText(name: string): string | null {
    const code = fieldErrors[name];
    if (!code) return null;
    switch (code) {
      case "missing":
        return t("savedStatements.templateValueMissing");
      case "unknown":
        return t("savedStatements.templateValueUnknown");
      case "oversized":
        return t("savedStatements.templateValueOversized");
      default:
        return t("savedStatements.templateValueInvalid");
    }
  }

  return (
    <div className="border-b border-border bg-muted/20 p-3">
      <label className="mb-2 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("savedStatements.parametersLabel")}
      </label>
      <div className="space-y-2">
        {parameters.map((param) => {
          const errorText = fieldErrorText(param.name);
          const errorId = `param-error-${worksheetId}-${param.name}`;
          return (
            <div key={param.name} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`param-value-${worksheetId}-${param.name}`}
                  className="w-32 shrink-0 truncate text-xs font-medium text-foreground"
                >
                  {param.name}
                  <span className="ml-1 text-muted-foreground">
                    ({t(`savedStatements.parameterType${param.type.charAt(0).toUpperCase()}${param.type.slice(1)}`)})
                  </span>
                </label>
                {param.type === "boolean" ? (
                  <select
                    id={`param-value-${worksheetId}-${param.name}`}
                    value={parameterValues[param.name] ?? ""}
                    onChange={(e) => onParameterValueChange(param.name, e.target.value)}
                    aria-label={t("savedStatements.parameterValueAriaLabel", { name: param.name })}
                    aria-invalid={errorText ? true : undefined}
                    aria-describedby={errorText ? errorId : undefined}
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">—</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <Input
                    id={`param-value-${worksheetId}-${param.name}`}
                    type={param.type === "integer" || param.type === "decimal" ? "number" : "text"}
                    step={param.type === "integer" ? "1" : param.type === "decimal" ? "any" : undefined}
                    value={parameterValues[param.name] ?? ""}
                    onChange={(e) => onParameterValueChange(param.name, e.target.value)}
                    placeholder={param.type === "string" ? "" : param.type === "integer" ? "0" : "0.0"}
                    aria-label={t("savedStatements.parameterValueAriaLabel", { name: param.name })}
                    aria-invalid={errorText ? true : undefined}
                    aria-describedby={errorText ? errorId : undefined}
                    className="h-8 flex-1 text-xs"
                  />
                )}
              </div>
              {errorText ? (
                <p id={errorId} role="alert" className="pl-[8.5rem] text-xs text-rose-600 dark:text-rose-400">
                  {errorText}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReadyWorksheet({
  worksheetId,
  statement,
  onStatementChange,
  parameters,
  parameterValues,
  onParameterValueChange,
  templateMode,
  templateFieldErrors,
  maxRows,
  onMaxRowsChange,
  onMaxRowsDraftValidityChange,
  runEnabled,
  isExecuting,
  onRun,
  explainEnabled,
  explainState,
  onExplain,
  onCloseExplain,
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
  metadataError,
  onRetryMetadata,
  previewProvenance,
  relatedRecords,
  onRelatedRecordsNavigate,
  onCloseRelatedRecords,
  currentPage,
  resultPagination,
  pageSize,
  onNextPage,
  onPreviousPage,
  onPageSizeChange,
  exportEnabled,
}: {
  worksheetId: string;
  statement: string;
  onStatementChange: (value: string) => void;
  parameters: readonly QuerySavedStatementParameterDefinition[];
  parameterValues: Record<string, string>;
  onParameterValueChange: (name: string, value: string) => void;
  templateMode: boolean;
  templateFieldErrors: Record<string, string>;
  maxRows: number;
  onMaxRowsChange: (value: number) => void;
  onMaxRowsDraftValidityChange: (valid: boolean) => void;
  runEnabled: boolean;
  isExecuting: boolean;
  onRun: () => void;
  explainEnabled: boolean;
  explainState: ExplainState;
  onExplain: () => void;
  onCloseExplain: () => void;
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
  metadataError: boolean;
  onRetryMetadata: () => void;
  previewProvenance: PreviewProvenance | null;
  relatedRecords: RelatedRecordsState;
  onRelatedRecordsNavigate: (foreignKey: string, localValues: readonly string[]) => void;
  onCloseRelatedRecords: () => void;
  currentPage: number;
  resultPagination: QueryExecutePaginationResponse | null;
  pageSize: number;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onPageSizeChange: (value: number) => void;
  exportEnabled: boolean;
}) {
  const t = useTranslations("queryWorkbench");
  const { namespace, columnFetcher } = useWorksheetSchemaAdapter(
    schemaStore,
    targetId,
    activeDatabase ?? undefined,
  );

  // Ref for the Related records trigger button, used for focus restoration
  // when the RelatedRecordsPanel closes. Avoids global querySelector.
  const relatedRecordsTriggerRef = useRef<HTMLButtonElement>(null);
  const explainTriggerRef = useRef<HTMLButtonElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const explainLoading = explainState.status === "loading";
  const explainButtonDisabled = !explainEnabled || isExecuting || explainLoading;

  // The input shows a raw draft so users can clear/retype freely; only valid
  // values are committed upward, so worksheet state never holds an invalid cap.
  // Render-time adjustment (not an effect) resyncs the draft when the
  // committed value or worksheet changes.
  const [maxRowsDraft, setMaxRowsDraft] = useState(() => String(maxRows));
  const [draftSource, setDraftSource] = useState({ worksheetId, maxRows });
  if (draftSource.worksheetId !== worksheetId || draftSource.maxRows !== maxRows) {
    setDraftSource({ worksheetId, maxRows });
    setMaxRowsDraft(String(maxRows));
  }

  const draftResult = parseMaxRowsDraft(maxRowsDraft);
  const canRun = runEnabled && draftResult.valid;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button ref={runButtonRef} type="button" size="sm" disabled={!canRun} onClick={onRun}>
          <Play className="size-3.5" aria-hidden />
          {t("editor.runReady")}
        </Button>
        {explainEnabled || explainState.status !== "idle" ? (
          <Button
            ref={explainTriggerRef}
            type="button"
            size="sm"
            variant="outline"
            disabled={explainButtonDisabled}
            onClick={onExplain}
            aria-label={t("explain.trigger")}
            data-testid="explain-trigger"
          >
            <SearchCode className="size-3.5" aria-hidden />
            {explainLoading ? t("explain.loading") : t("explain.trigger")}
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onFormat}
          disabled={isExecuting || explainLoading}
        >
          {t("editor.format")}
        </Button>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{t("editor.maxRowsLabel")}</span>
          <Input
            type="number"
            min={1}
            max={500}
            step={1}
            value={maxRowsDraft}
            onChange={(event) => {
              setMaxRowsDraft(event.target.value);
              const result = parseMaxRowsDraft(event.target.value);
              onMaxRowsDraftValidityChange(result.valid);
              if (result.valid) {
                onMaxRowsChange(result.value);
              }
            }}
            aria-label={t("editor.maxRowsLabel")}
            aria-invalid={!draftResult.valid || undefined}
            aria-describedby={!draftResult.valid ? "max-rows-range-error" : undefined}
            className="h-8 w-20"
          />
          {!draftResult.valid && (
            <p id="max-rows-range-error" role="alert" className="ml-1 text-xs text-rose-600 dark:text-rose-400">
              {t("editor.maxRowsRangeError")}
            </p>
          )}
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {isExecuting ? t("editor.runReady") : t("editor.ready")}
        </span>
        <span data-testid="provenance-state" data-has-provenance={!!previewProvenance} className="sr-only" />
      </div>

      <div className="border-b border-border bg-muted/20 p-3">
        <label className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("editor.statementLabel")}
        </label>
        {metadataError ? (
          <div
            role="alert"
            data-testid="metadata-warning"
            className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <span>{t("editor.metadataWarning")}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRetryMetadata}
              aria-label={t("editor.metadataRetry")}
            >
              {t("editor.metadataRetry")}
            </Button>
          </div>
        ) : null}
        <SqlCodeEditor
          key={worksheetId}
          value={statement}
          onChange={onStatementChange}
          engine={engine}
          onRun={canRun ? onRun : undefined}
          onFormat={onFormat}
          onEditorView={onEditorView}
          ariaLabel={t("editor.statementLabel")}
          disabled={isExecuting || explainLoading}
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

      <WorksheetParameterInputs
        worksheetId={worksheetId}
        parameters={parameters}
        parameterValues={parameterValues}
        fieldErrors={templateFieldErrors}
        onParameterValueChange={onParameterValueChange}
        t={t}
      />
      {templateMode && (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-border bg-emerald-500/5 px-3 py-2"
          role="status"
        >
          <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {t("savedStatements.templateModeBanner")}
          </span>
          <span className="text-xs text-muted-foreground">
            {t("savedStatements.templateModeHint")}
          </span>
        </div>
      )}

      <div className="p-3">
        {error ? (
          <ExecuteErrorPanel error={error} onRetry={onRun} />
        ) : result ? (
          <>
            <ExecuteResult
              result={result}
              exportEnabled={exportEnabled}
              navigationCapability={
                previewProvenance && !isExecuting
                  ? {
                      sourceDatabase: previewProvenance.database,
                      sourceObject: previewProvenance.table,
                      foreignKeys: previewProvenance.foreignKeys,
                      foreignKeysTruncated: previewProvenance.foreignKeysTruncated,
                      onNavigate: (foreignKey, localValues) =>
                        onRelatedRecordsNavigate(foreignKey, localValues),
                    }
                  : undefined
              }
              relatedRecordsTriggerRef={relatedRecordsTriggerRef}
              onRelatedRecordsIneligible={onCloseRelatedRecords}
            />
            {resultPagination && (
              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3" data-testid="result-paging">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t("paging.previousPage")}
                  disabled={!draftResult.valid || isExecuting || currentPage <= 1 || !resultPagination.hasPreviousPage}
                  onClick={onPreviousPage}
                >
                  {t("paging.previousPage")}
                </Button>
                <span className="min-w-16 text-center text-xs text-muted-foreground" aria-live="polite">
                  {t("paging.page", { page: currentPage })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-label={t("paging.nextPage")}
                  disabled={!draftResult.valid || isExecuting || !resultPagination.hasNextPage}
                  onClick={onNextPage}
                >
                  {t("paging.nextPage")}
                </Button>
                <Select
                  value={String(pageSize)}
                  onValueChange={(value) => onPageSizeChange(Number(value))}
                  disabled={!draftResult.valid || isExecuting}
                >
                  <SelectTrigger size="sm" aria-label={t("paging.pageSize")} className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUERY_RESULT_PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {relatedRecords.status !== "idle" && (
              <RelatedRecordsPanel
                state={relatedRecords}
                onClose={onCloseRelatedRecords}
                triggerRef={relatedRecordsTriggerRef}
              />
            )}
          </>
        ) : explainState.status === "idle" ? (
          <p className="text-sm text-muted-foreground">{t("result.notExecuted")}</p>
        ) : null}
        {explainState.status !== "idle" && (
          <ExplainPanel
            state={explainState}
            onClose={onCloseExplain}
            onRetry={onExplain}
            triggerRef={explainTriggerRef}
            fallbackFocusRef={runButtonRef}
          />
        )}
      </div>
    </div>
  );
}

function ExecuteResult({ result, navigationCapability, relatedRecordsTriggerRef, onRelatedRecordsIneligible, exportEnabled }: { result: QueryExecuteResponse; navigationCapability?: NavigationCapability; relatedRecordsTriggerRef?: React.RefObject<HTMLButtonElement | null>; onRelatedRecordsIneligible?: () => void; exportEnabled: boolean }) {
  const t = useTranslations("queryWorkbench");

  const normalized = normalizeExecuteResponse(result);
  if (!normalized.ok) {
    return (
      <div role="alert" className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          {t("error.internal_error")}
        </p>
        <p className="text-sm text-muted-foreground">
          <span className="font-medium">{t("error.detailLabel")}: </span>
          {normalized.error}
        </p>
      </div>
    );
  }

  const safeResult = normalized.response;

  return (
    <div className="space-y-3">
      <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <dd>{t("result.rowCount", { count: safeResult.rowCount })}</dd>
        <dd>{t("result.durationMs", { count: safeResult.durationMs })}</dd>
        <dd>{t("result.limitApplied", { limit: safeResult.limitApplied })}</dd>
        {safeResult.truncated ? <dd className="font-medium text-amber-600 dark:text-amber-400">{t("result.truncated")}</dd> : null}
        <dd>
          {t("result.executionIdLabel")} {safeResult.executionId}
        </dd>
        <dd>
          {t("result.executedAtLabel")} {safeResult.executedAt}
        </dd>
      </dl>

      <ResultTable key={safeResult.executionId} columns={safeResult.columns} rows={safeResult.rows} navigationCapability={navigationCapability} relatedRecordsTriggerRef={relatedRecordsTriggerRef} onRelatedRecordsIneligible={onRelatedRecordsIneligible} exportEnabled={exportEnabled} />
    </div>
  );
}

function RelatedRecordsPanel({
  state,
  onClose,
  triggerRef,
}: {
  state: RelatedRecordsState;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("queryWorkbench");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.status === "ready" || state.status === "error") {
      closeRef.current?.focus();
    }
  }, [state.status]);

  function handleClose() {
    onClose();
    requestAnimationFrame(() => {
      triggerRef?.current?.focus();
    });
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-muted/20 p-3" role="region" aria-label={t("result.relatedRecords")}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-foreground">{t("result.relatedRecords")}</h3>
        <Button
          ref={closeRef}
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleClose}
          aria-label={t("result.closeRelatedRecords")}
        >
          {t("result.closeRelatedRecords")}
        </Button>
      </div>
      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground">{t("result.relatedRecordsLoading")}</p>
      )}
      {state.status === "ready" && (() => {
        const normalized = normalizeExecuteResponse(state.response);
        if (!normalized.ok) {
          return <p className="text-sm text-rose-700 dark:text-rose-300">{t("result.relatedRecordsError")}</p>;
        }
        const safeResponse = normalized.response;
        if (safeResponse.rowCount === 0) {
          return <p className="text-sm text-muted-foreground">{t("result.relatedRecordsEmpty")}</p>;
        }
        return (
          <>
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mb-2">
              <dd>{t("result.rowCount", { count: safeResponse.rowCount })}</dd>
              <dd>{t("result.durationMs", { count: safeResponse.durationMs })}</dd>
              {safeResponse.truncated ? <dd className="font-medium text-amber-600 dark:text-amber-400">{t("result.relatedRecordsTruncated")}</dd> : null}
            </dl>
            <ResultTable columns={safeResponse.columns} rows={safeResponse.rows} exportEnabled={false} />
          </>
        );
      })()}
      {state.status === "error" && (
        <p className="text-sm text-rose-700 dark:text-rose-300">{t("result.relatedRecordsError")}</p>
      )}
    </div>
  );
}

function ExplainPanel({
  state,
  onClose,
  onRetry,
  triggerRef,
  fallbackFocusRef,
}: {
  state: ExplainState;
  onClose: () => void;
  onRetry: () => void;
  triggerRef?: React.RefObject<HTMLButtonElement | null>;
  fallbackFocusRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("queryWorkbench");
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state.status === "ready" || state.status === "error") {
      closeRef.current?.focus();
    }
  }, [state.status]);

  function handleClose() {
    onClose();
    requestAnimationFrame(() => {
      const trigger = triggerRef?.current;
      if (trigger?.isConnected) {
        trigger.focus();
        return;
      }
      fallbackFocusRef?.current?.focus();
    });
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      handleClose();
    }
  }

  return (
    <div
      className="mt-3 rounded-lg border border-border bg-muted/20 p-3"
      role="region"
      aria-label={t("explain.title")}
      data-testid="explain-panel"
      onKeyDown={handleKeyDown}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-foreground">{t("explain.title")}</h3>
        <Button
          ref={closeRef}
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleClose}
          aria-label={t("explain.close")}
          data-testid="explain-close"
        >
          {t("explain.close")}
        </Button>
      </div>

      {state.status === "loading" && (
        <p className="text-sm text-muted-foreground" data-testid="explain-loading">
          {t("explain.loading")}
        </p>
      )}

      {state.status === "error" && (
        <div role="alert" className="space-y-2" data-testid="explain-error">
          <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
            {t("explain.error.title")}
          </p>
          <p className="text-sm text-rose-700 dark:text-rose-300">
            {t(`explain.error.${explainErrorCopyCode(state.errorCode)}`)}
          </p>
          {isRetryableControlledErrorCode(state.errorCode ?? "service_unavailable") ? (
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              {t("explain.retry")}
            </Button>
          ) : null}
        </div>
      )}

      {state.status === "ready" && state.response && (
        <div className="space-y-3" data-testid="explain-ready">
          {state.response.truncated ? (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {t("explain.truncated")}
            </p>
          ) : null}

          {state.response.risks.length > 0 ? (
            <ul className="flex flex-wrap gap-2" data-testid="explain-risks">
              {state.response.risks.map((risk) => (
                <li key={risk.code}>
                  <Badge
                    variant="outline"
                    className={cn(
                      risk.severity === "warning" &&
                        "border-amber-500/40 text-amber-700 dark:text-amber-300",
                      risk.severity === "critical" &&
                        "border-rose-500/40 text-rose-700 dark:text-rose-300",
                      risk.severity === "info" &&
                        "border-sky-500/40 text-sky-700 dark:text-sky-300",
                    )}
                    data-risk-code={risk.code}
                    data-risk-severity={risk.severity}
                  >
                    {t(`explain.risks.${risk.code}.label`)}
                    <span className="sr-only">
                      {t(`explain.severities.${risk.severity}`)}
                    </span>
                  </Badge>
                </li>
              ))}
            </ul>
          ) : null}

          {state.response.nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("explain.emptyNodes")}</p>
          ) : (
            <ul className="space-y-2" data-testid="explain-nodes">
              {state.response.nodes.map((node) => (
                <li
                  key={node.id}
                  className="rounded-md border border-border bg-background/60 px-3 py-2 text-sm"
                  aria-label={t("explain.nodeAriaLabel", {
                    id: node.id,
                    operation: t(`explain.operations.${node.operation}`),
                  })}
                  data-node-id={node.id}
                  data-node-operation={node.operation}
                  data-node-access={node.access}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">
                      {t(`explain.operations.${node.operation}`)}
                    </span>
                    <Badge variant="secondary">{t(`explain.access.${node.access}`)}</Badge>
                    {node.estimatedRows !== undefined ? (
                      <span className="text-xs text-muted-foreground">
                        {t("explain.estimatedRowsLabel")}: {node.estimatedRows}
                      </span>
                    ) : null}
                    {node.usesIndex !== undefined ? (
                      <span className="text-xs text-muted-foreground">
                        {t("explain.usesIndexLabel")}:{" "}
                        {node.usesIndex
                          ? t("explain.usesIndexTrue")
                          : t("explain.usesIndexFalse")}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Result grid with roving-tabindex keyboard selection and a single toolbar copy
 * action. The grid uses role="grid" with role="columnheader" / role="gridcell";
 * only the active cell is in the Tab order (tabIndex=0). Arrow keys move the
 * active cell; Enter/Space selects it for copy. A single Copy button in the
 * toolbar copies the currently selected value.
 *
 * Selection resets when columns or rows change (new execution), preventing
 * stale copies of invisible values.
 */
function ResultTable({
  columns,
  rows,
  navigationCapability,
  relatedRecordsTriggerRef,
  onRelatedRecordsIneligible,
  exportEnabled,
}: {
  columns: QueryExecuteResponse["columns"];
  rows: QueryExecuteResponse["rows"];
  navigationCapability?: NavigationCapability;
  relatedRecordsTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  onRelatedRecordsIneligible?: () => void;
  exportEnabled: boolean;
}) {
  const t = useTranslations("queryWorkbench");

  // Roving-tabindex active cell. row = -1 means the header row.
  // Initialized to the first data cell so Tab can enter the grid.
  const [activeCell, setActiveCell] = useState<{ row: number; col: number }>({ row: 0, col: 0 });
  // Ref map for programmatic focus during arrow-key navigation.
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  function setCellRef(row: number, col: number, el: HTMLElement | null) {
    const key = `${row},${col}`;
    if (el) {
      cellRefs.current.set(key, el);
    } else {
      cellRefs.current.delete(key);
    }
  }

  function focusCell(row: number, col: number) {
    cellRefs.current.get(`${row},${col}`)?.focus();
  }

  // Selection for copy (distinct from keyboard focus).
  const [selectedCell, setSelectedCell] = useState<{
    rowIndex: number;
    colIndex: number;
    value: QueryResultCellValue;
  } | null>(null);
  const [selectedHeader, setSelectedHeader] = useState<{
    colIndex: number;
    name: string;
  } | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the feedback timer on unmount. Selection state resets automatically
  // via the key={executionId} prop on ResultTable which forces a remount.
  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const colCount = columns.length;
  const rowCount = rows.length;

  // Compute eligible FKs for the current selected data row.
  const eligibleFKs = useMemo(() => {
    if (!navigationCapability || !selectedCell || selectedHeader) {
      return [];
    }
    if (navigationCapability.foreignKeysTruncated) {
      return [];
    }
    const columnNames = columns.map((col) => col.name);
    const result: Array<{ foreignKey: string; localValues: readonly string[]; referencedDatabase: string; referencedObject: string; referencedColumns: readonly string[] }> = [];
    for (const fk of navigationCapability.foreignKeys) {
      // Fail-closed: skip empty or duplicate FK column lists.
      if (fk.columns.length === 0) continue;
      if (new Set(fk.columns).size !== fk.columns.length) continue;

      const localValues: string[] = [];
      let eligible = true;
      for (const fkCol of fk.columns) {
        const colIndex = columnNames.indexOf(fkCol);
        if (colIndex === -1 || columnNames.filter((n) => n === fkCol).length !== 1) {
          eligible = false;
          break;
        }
        // Exclude FK columns whose values are masked — never send masked
        // raw-protected values to construct a related-record request.
        if (!isColumnCopyable(columns[colIndex]!)) {
          eligible = false;
          break;
        }
        const cellValue = rows[selectedCell.rowIndex]?.[colIndex];
        if (cellValue === null || cellValue === undefined) {
          eligible = false;
          break;
        }
        localValues.push(String(cellValue));
      }
      if (eligible && localValues.length === fk.columns.length) {
        result.push({
          foreignKey: fk.name,
          localValues,
          referencedDatabase: fk.referencedDatabase,
          referencedObject: fk.referencedObject,
          referencedColumns: fk.referencedColumns,
        });
      }
    }
    return result;
  }, [navigationCapability, selectedCell, selectedHeader, columns, rows]);

  const prevEligibleCountRef = useRef(eligibleFKs.length);
  useEffect(() => {
    if (prevEligibleCountRef.current > 0 && eligibleFKs.length === 0 && onRelatedRecordsIneligible) {
      onRelatedRecordsIneligible();
    }
    prevEligibleCountRef.current = eligibleFKs.length;
  }, [eligibleFKs.length, onRelatedRecordsIneligible]);

  function showFeedback(message: string, type: "success" | "error") {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setCopyFeedback({ message, type });
    feedbackTimerRef.current = setTimeout(() => {
      setCopyFeedback(null);
    }, 2000);
  }

  function getCellCopyText(value: QueryResultCellValue): string {
    if (value === null) return t("result.nullMarker");
    if (typeof value === "boolean") return value ? "true" : "false";
    return String(value);
  }

  function selectCellAt(rowIndex: number, colIndex: number) {
    const value = rows[rowIndex]?.[colIndex] ?? null;
    setSelectedCell({ rowIndex, colIndex, value });
    setSelectedHeader(null);
  }

  function selectHeaderAt(colIndex: number) {
    setSelectedHeader({ colIndex, name: columns[colIndex]?.name ?? "" });
    setSelectedCell(null);
  }

  function handleCellClick(row: number, col: number) {
    setActiveCell({ row, col });
    selectCellAt(row, col);
  }

  function handleHeaderClick(col: number) {
    setActiveCell({ row: -1, col });
    selectHeaderAt(col);
  }

  // Defense-in-depth: check both displayMode and copyAllowed to fail closed
  // on backend drift or bug (e.g., masked_no_copy + copyAllowed:true).
  function isColumnCopyable(col: QueryResultColumn | undefined): boolean {
    return col?.displayMode === "raw_copy_allowed" && col?.copyAllowed === true;
  }

  function handleGridKeyDown(event: React.KeyboardEvent) {
    const { row, col } = activeCell;

    switch (event.key) {
      case "ArrowRight": {
        event.preventDefault();
        const nextCol = Math.min(col + 1, colCount - 1);
        setActiveCell({ row, col: nextCol });
        focusCell(row, nextCol);
        break;
      }
      case "ArrowLeft": {
        event.preventDefault();
        const prevCol = Math.max(col - 1, 0);
        setActiveCell({ row, col: prevCol });
        focusCell(row, prevCol);
        break;
      }
      case "ArrowDown": {
        event.preventDefault();
        if (row < rowCount - 1) {
          setActiveCell({ row: row + 1, col });
          focusCell(row + 1, col);
        }
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        if (row >= 0) {
          setActiveCell({ row: row - 1, col });
          focusCell(row - 1, col);
        }
        break;
      }
      case "Enter":
      case " ": {
        event.preventDefault();
        if (row === -1) {
          selectHeaderAt(col);
        } else {
          selectCellAt(row, col);
        }
        break;
      }
      default:
        break;
    }
  }

  function handleExportCsv() {
    if (!exportEnabled) return;
    const url = URL.createObjectURL(
      new Blob([serializeQueryResultCsv(columns, rows)], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "query-results.csv";
    document.body.append(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      URL.revokeObjectURL(url);
    }
  }

  async function handleCopy() {
    let text: string;
    if (selectedCell) {
      const column = columns[selectedCell.colIndex];
      if (column && !isColumnCopyable(column)) {
        return;
      }
      text = getCellCopyText(selectedCell.value);
    } else if (selectedHeader) {
      text = selectedHeader.name;
    } else {
      return;
    }
    const success = await copyToClipboard(text);
    showFeedback(
      success ? t("result.copySuccess") : t("result.copyFailed"),
      success ? "success" : "error",
    );
  }

  function copyButtonLabel(): string {
    if (selectedCell) {
      const column = columns[selectedCell.colIndex];
      if (column && !isColumnCopyable(column)) {
        return t("result.copyNotAllowed");
      }
      return t("result.copyCellAriaLabel", { value: getCellCopyText(selectedCell.value) });
    }
    if (selectedHeader) {
      return t("result.copyColumnNameAriaLabel", { name: selectedHeader.name });
    }
    return t("result.copyCellValue");
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("result.noRows")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selectedCell && !selectedHeader || (selectedCell ? !isColumnCopyable(columns[selectedCell.colIndex]) : false)}
          onClick={() => void handleCopy()}
          aria-label={copyButtonLabel()}
          data-testid="copy-selection"
        >
          <Copy className="size-3.5" aria-hidden />
          {t("result.copyCellValue")}
        </Button>
        {exportEnabled && <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
        >
          <Download className="size-3.5" aria-hidden />
          {t("result.exportCsv")}
        </Button>}
        {eligibleFKs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  ref={relatedRecordsTriggerRef}
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="related-records"
                />
              }
            >
              <ListTree className="size-3.5" aria-hidden />
              {t("result.relatedRecords")}
              <ChevronDown className="size-3" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {eligibleFKs.map((fk) => (
                <DropdownMenuItem
                  key={fk.foreignKey}
                  onClick={() => navigationCapability?.onNavigate(fk.foreignKey, fk.localValues)}
                >
                  {t("result.relatedRecordsFor", {
                    foreignKey: fk.foreignKey,
                    referencedTable: `${fk.referencedDatabase}.${fk.referencedObject}`,
                  })}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {copyFeedback && (
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "text-xs font-medium",
              copyFeedback.type === "success"
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400",
            )}
          >
            {copyFeedback.type === "success" ? (
              <Check className="mr-0.5 inline-block size-3" aria-hidden />
            ) : null}
            {copyFeedback.message}
          </span>
        )}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- roving tabindex: only the active cell has tabIndex=0 */}
        <table
          role="grid"
          className="w-full border-collapse text-sm"
          onKeyDown={handleGridKeyDown}
        >
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((column, colIndex) => {
                const isActive = activeCell?.row === -1 && activeCell.col === colIndex;
                const isSelected = selectedHeader?.colIndex === colIndex;
                return (
                  <th
                    key={column.name}
                    ref={(el) => setCellRef(-1, colIndex, el)}
                    scope="col"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => handleHeaderClick(colIndex)}
                    onFocus={() => setActiveCell({ row: -1, col: colIndex })}
                    data-selected={isSelected ? "" : undefined}
                    className={cn(
                      "cursor-default select-none px-3 py-2 font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                      isSelected && "ring-2 ring-inset ring-ring",
                    )}
                  >
                    {column.name}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-border/60">
                {row.map((cell, cellIndex) => {
                  const isActive = activeCell?.row === rowIndex && activeCell.col === cellIndex;
                  const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.colIndex === cellIndex;
                  return (
                    <td
                      key={cellIndex}
                      ref={(el) => setCellRef(rowIndex, cellIndex, el)}
                      tabIndex={isActive ? 0 : -1}
                      onClick={() => handleCellClick(rowIndex, cellIndex)}
                      onFocus={() => setActiveCell({ row: rowIndex, col: cellIndex })}
                      data-selected={isSelected ? "" : undefined}
                      className={cn(
                        "cursor-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                        isSelected && "ring-2 ring-inset ring-ring",
                      )}
                    >
                      <ResultCell value={cell} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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

const QUERY_EXECUTE_ERROR_COPY_CODES = new Set([
  "validation_failed",
  "query_not_allowed",
  "query_target_not_found",
  "query_explain_not_supported",
  "query_result_disclosure_blocked",
  "query_timeout",
  "query_backend_error",
  "internal_error",
  "service_unavailable",
  "forbidden",
  "not_found",
  "saved_statement_not_found",
]);

function executeErrorCopyCode(code: string): string {
  return QUERY_EXECUTE_ERROR_COPY_CODES.has(code) ? code : "unavailable";
}

const EXPLAIN_ERROR_COPY_CODES = new Set([
  "validation_failed",
  "query_not_allowed",
  "query_target_not_found",
  "query_explain_not_supported",
  "query_result_disclosure_blocked",
  "query_timeout",
  "query_backend_error",
  "internal_error",
  "service_unavailable",
]);

function explainErrorCopyCode(code: string | null): string {
  if (code && EXPLAIN_ERROR_COPY_CODES.has(code)) {
    return code;
  }
  return "unavailable";
}

function ExecuteErrorPanel({
  error,
  onRetry,
}: {
  error: QueryExecuteError;
  onRetry: () => void;
}) {
  const t = useTranslations("queryWorkbench");
  const copyCode = executeErrorCopyCode(error.code);
  const showRetry = isRetryableControlledErrorCode(error.code);

  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {t(`error.${copyCode}`)}
      </p>
      {showRetry ? (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          {t("error.retry")}
        </Button>
      ) : null}
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

function LockedResult() {
  const t = useTranslations("queryWorkbench");

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-medium text-foreground">{t("result.grid")}</span>
        <span className="text-xs text-muted-foreground">{t("result.notExecuted")}</span>
      </div>

      <div
        role="tabpanel"
        aria-label={t("result.lockTitle")}
        className="relative m-3 overflow-hidden rounded-lg border border-amber-500/40 bg-amber-500/5 p-5"
      >
        <div className="space-y-3">
          <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
            {t("result.lockTitle")}
          </p>
          <p className="text-sm text-muted-foreground">{t("result.lockDescription")}</p>
        </div>
      </div>
    </div>
  );
}
