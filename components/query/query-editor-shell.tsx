"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { ArrowDown, ArrowDownUp, ArrowUp, Check, ChevronDown, Copy, Download, ListTree, Lock, Play, SearchCode, TriangleAlert } from "lucide-react";
import type { EditorView } from "@codemirror/view";

import type { QueryTarget } from "@/types/query-target";
import type {
  QueryExecutePaginationResponse,
  QueryExecuteResponse,
  QueryExecutionFilter,
  QueryExecutionHistoryExecution,
  QueryExecutionRecord,
  QueryResultCellValue,
  QueryExecutionStatus,
  TablePreviewRequest,
} from "@/types/query-execution";
import type { QuerySavedStatementParameterDefinition, QuerySavedStatementRecord } from "@/types/query-saved-statement";
import { ApiError } from "@/services/api-client";
import { QueryExecuteError, getQueryExecutionStatement, isAbortError, isRetryableControlledErrorCode } from "@/services/query-executions";
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
import { QueryResultCellViewer } from "@/components/query/query-result-cell-viewer";
import { QuerySavedStatements } from "@/components/query/query-saved-statements";
import { SqlCodeEditor } from "@/components/query/sql-code-editor";
import {
  resolveWorksheetRunScope,
  type WorksheetRunScope,
} from "@/lib/sql-run-scope";
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
  type SchemaCatalog,
} from "@/lib/schema-catalog";
import type { ForeignKeyDetail, ObjectSummary } from "@/types/query-schema";
import type { ClickHouseWorksheetCatalog } from "@/lib/use-clickhouse-worksheet-catalog";
import type { SchemaNamespace } from "@/lib/query-sql-completion";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";
import { copyToClipboard } from "@/lib/clipboard";
import { serializeQueryResultCsv } from "@/lib/query-result-csv";
import { isQueryResultExportable, serializeQueryResultJson } from "@/lib/query-result-export";
import { normalizeExecuteResponse } from "@/lib/query-result-envelope";
import { viewQueryResultPage, type ResultPageFilter, type ResultPageSort } from "@/lib/query-result-page-view";
import {
  isColumnCopyable,
  resultRangeBetween,
  resultRangeCopyRefusal,
  serializeResultRangeTsv,
  type ResultCellPoint,
} from "@/lib/query-result-range";
import {
  DEFAULT_STATEMENT,
  INITIAL_WORKSHEET_ID,
  MAX_WORKSHEETS,
  WorksheetSession,
  useWorksheetSessionVersion,
  type CancellationState,
  type ExplainState,
  type PreviewProvenance,
  type RelatedRecordsState,
} from "@/lib/worksheet-session";

type QueryEditorShellProps = {
  clickHouseCatalog?: ClickHouseWorksheetCatalog;
  targets: QueryTarget[];
  activeTarget: QueryTarget;
  targetSelectionVersion: number;
  /** The pin came from an explicit ?targetId= deep link — hydrate must honor it over restore order. */
  explicitActiveTarget?: boolean;
  onActiveTargetChange: (resourceId: number) => void;
  onActiveDatabaseChange?: (database: string | null) => void;
  schemaStore: SchemaCatalog;
  pendingPreviewEvent?: { id: number; request: TablePreviewRequest } | null;
  onPreviewConsumed?: () => void;
  /** Opens the connection drawer so the user can pick a runnable target. */
  onChooseTarget?: () => void;
  /** Object-tree insert-name requests routed through the workbench. */
  pendingInsertEvent?: { id: number; object: ObjectSummary } | null;
  onInsertConsumed?: () => void;
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
  "cancelled",
];

type NavigationCapability = {
  readonly sourceDatabase: string;
  readonly sourceObject: string;
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
  readonly onNavigate: (foreignKey: string, localValues: readonly string[]) => void;
};

export function QueryEditorShell({ clickHouseCatalog, targets, activeTarget, targetSelectionVersion, explicitActiveTarget = false, onActiveTargetChange, onActiveDatabaseChange, schemaStore, pendingPreviewEvent, onPreviewConsumed, onChooseTarget, pendingInsertEvent, onInsertConsumed }: QueryEditorShellProps) {
  const t = useTranslations("queryWorkbench");
  const { resolvedTheme, theme } = useTheme();
  const [activeTab, setActiveTab] = useState<WorksheetTab>("worksheet");
  const [renamingWorksheetId, setRenamingWorksheetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [editorHeight, setEditorHeight] = useState(DEFAULT_QUERY_EDITOR_HEIGHT);
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

  const pagingTargetsRef = useRef(new Set<number>());
  const generationByTargetRef = useRef(new Map<number, string | undefined>());
  const engineByTargetRef = useRef(new Map([[activeTarget.resourceId, activeTarget.connectionContext.engine]]));
  const tRef = useRef(t);
  tRef.current = t;
  const [session] = useState(
    () =>
      new WorksheetSession({
        initialTargetId: activeTarget.resourceId,
        clickHousePagingFor: (targetId) => pagingTargetsRef.current.has(targetId),
        generationFor: (targetId) => generationByTargetRef.current.get(targetId),
        engineFor: (targetId) => engineByTargetRef.current.get(targetId),
        worksheetName: (index) => tRef.current("editor.worksheetName", { index }),
        previewName: (table) => tRef.current("editor.previewName", { table }),
      }),
  );
  useWorksheetSessionVersion(session);
  const worksheets = session.list;
  const activeWorksheetId = session.activeId;

  const focusActiveTabAfterCloseRef = useRef(false);
  useEffect(() => {
    if (!focusActiveTabAfterCloseRef.current) return;
    focusActiveTabAfterCloseRef.current = false;
    document.getElementById(`ws-tab-${session.activeId}`)?.focus();
  });
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
  // Whether THIS mount was a deep link is fixed at mount time: the URL's
  // targetId param later flips on user-driven target switches (router.replace
  // re-renders the server page), which must not re-arm deep-link hydration.
  const explicitActiveTargetRef = useRef(explicitActiveTarget);
  const workspaceWorksheets = session.persistedSnapshot();
  const workspaceSignature = JSON.stringify(workspaceWorksheets);
  // Authoritative workspace version: the server only ever increases the OCC
  // version, so a late GET response or a stale debounce closure must never move
  // it backwards — a regressed version is how self-inflicted 409s happen.
  const workspaceVersionRef = useRef<number | null>(null);
  const latestWorkspaceSignatureRef = useRef(workspaceSignature);
  latestWorkspaceSignatureRef.current = workspaceSignature;
  const applyWorkspaceVersion = useCallback((version: number | null) => {
    if (version === null) {
      workspaceVersionRef.current = null;
      setWorkspaceVersion(null);
      return;
    }
    const next = Math.max(workspaceVersionRef.current ?? 0, version);
    workspaceVersionRef.current = next;
    setWorkspaceVersion(next);
  }, []);

  const loadWorkspace = useCallback(async (replaceEmpty = false) => {
    try {
      const workspace = await getQueryWorkspace();
      if (!replaceEmpty && workspace.worksheets.length > 0 && localWorkspaceChangedRef.current) {
        applyWorkspaceVersion(workspace.version);
        setWorkspaceProblem(null);
        setWorkspaceConflict(true);
        return;
      }
      if (workspace.worksheets.length > 0 || replaceEmpty) {
        session.hydrate(
          workspace.worksheets,
          activeTargetRef.current.resourceId,
          explicitActiveTargetRef.current,
        );
        savedWorkspaceSignatureRef.current = JSON.stringify(session.persistedSnapshot());
        // No restored worksheet binds the deep-linked target: open a fresh one
        // so the explicit pin survives instead of snapping to items[0]'s target.
        if (
          explicitActiveTargetRef.current &&
          session.active.targetResourceId !== activeTargetRef.current.resourceId
        ) {
          session.add(activeTargetRef.current.resourceId);
        }
      } else {
        savedWorkspaceSignatureRef.current = "[]";
      }
      applyWorkspaceVersion(workspace.version);
      setWorkspaceProblem(null);
      setWorkspaceConflict(false);
      localWorkspaceChangedRef.current = false;
    } catch {
      setWorkspaceProblem("load");
    }
  }, [session, applyWorkspaceVersion]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const persistAliveRef = useRef(true);
  const persistAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    persistAliveRef.current = true;
    const controller = new AbortController();
    persistAbortRef.current = controller;
    return () => {
      persistAliveRef.current = false;
      queuedWorkspaceSaveRef.current = null;
      // Do not abort an in-flight save: the request may already have committed
      // server-side, and dropping the response desyncs the OCC version. Let it
      // settle; persistAliveRef already suppresses state writes on the dead
      // component, and a committed snapshot is the user's own work.
      persistAbortRef.current = null;
      workspaceSaveInFlightRef.current = false;
    };
  }, []);

  // Unmount/logout: release every request the session still owns — in-flight
  // executions, navigation attempts, and pending cancellation probes.
  useEffect(() => () => session.dispose(), [session]);

  // A failed persist may still have committed server-side (a dropped response
  // does not roll back the write), and a stale-version 409 tells us the server
  // moved ahead. Re-read the authoritative workspace and reconcile: adopt the
  // server version when our attempted snapshot (or the current local one) is
  // what the server already stores; let the signature effect resend with a
  // fresh version when the server still holds our last save; only surface the
  // conflict UX when the server content is genuinely foreign.
  const reconcileWorkspaceSaveFailure = useCallback(
    async (attemptedSignature: string) => {
      try {
        const workspace = await getQueryWorkspace();
        if (!persistAliveRef.current) return;
        const serverSignature = JSON.stringify(workspace.worksheets);
        if (
          serverSignature === attemptedSignature ||
          serverSignature === latestWorkspaceSignatureRef.current
        ) {
          applyWorkspaceVersion(workspace.version);
          savedWorkspaceSignatureRef.current = serverSignature;
          setWorkspaceProblem(null);
          return;
        }
        if (serverSignature === savedWorkspaceSignatureRef.current) {
          applyWorkspaceVersion(workspace.version);
          setWorkspaceProblem(null);
          return;
        }
        // Foreign server content: keep our version stale so any already-
        // scheduled send still 409s instead of overwriting another writer.
        setWorkspaceConflict(true);
      } catch {
        if (persistAliveRef.current) setWorkspaceProblem("save");
      }
    },
    [applyWorkspaceVersion],
  );

  const saveWorkspace = useCallback(function persistWorkspace(
    signature: string,
    snapshot: readonly QueryWorkspaceWorksheet[],
  ): void {
    if (!persistAliveRef.current) return;
    const version = workspaceVersionRef.current;
    if (version === null) return;
    if (workspaceSaveInFlightRef.current) {
      queuedWorkspaceSaveRef.current = { signature, worksheets: snapshot };
      return;
    }

    workspaceSaveInFlightRef.current = true;
    void putQueryWorkspace(version, snapshot, persistAbortRef.current?.signal).then(
      (workspace) => {
        if (!persistAliveRef.current) {
          workspaceSaveInFlightRef.current = false;
          queuedWorkspaceSaveRef.current = null;
          return;
        }
        savedWorkspaceSignatureRef.current = signature;
        applyWorkspaceVersion(workspace.version);
        setWorkspaceProblem(null);

        const queued = queuedWorkspaceSaveRef.current;
        queuedWorkspaceSaveRef.current = null;
        workspaceSaveInFlightRef.current = false;
        if (queued && queued.signature !== signature) {
          persistWorkspace(queued.signature, queued.worksheets);
        }
      },
      (error: unknown) => {
        queuedWorkspaceSaveRef.current = null;
        workspaceSaveInFlightRef.current = false;
        if (!persistAliveRef.current) return;
        // A re-read can only help when the outcome is genuinely unknown (a
        // dropped response or a 409). An aborted save was deliberately torn
        // down, and a 401 means the session is gone: the reconcile GET would
        // be a second unauthenticated request failing identically, which the
        // logout race surfaces as a stray 401 before navigation finishes.
        if (isAbortError(error)) return;
        if (
          (error instanceof ApiError || error instanceof QueryExecuteError) &&
          error.status === 401
        ) {
          return;
        }
        void reconcileWorkspaceSaveFailure(signature);
      },
    );
  }, [applyWorkspaceVersion, reconcileWorkspaceSaveFailure]);

  useEffect(() => {
    if (
      workspaceVersion === null ||
      workspaceProblem !== null ||
      workspaceConflict ||
      savedWorkspaceSignatureRef.current === workspaceSignature
    ) return;

    const timer = window.setTimeout(() => {
      saveWorkspace(workspaceSignature, workspaceWorksheets);
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

  useEffect(() => {
    pagingTargetsRef.current = new Set(targets.filter(t => t.availableActions.clickHousePaging).map(t => t.resourceId));
    generationByTargetRef.current = new Map(targets.map(t => [t.resourceId, t.clickHouseGeneration]));
    engineByTargetRef.current = new Map(
      targets.map((t) => [t.resourceId, t.connectionContext.engine]),
    );
  }, [targets]);

  // Derive execution permissions from the worksheet's own target, not the
  // parent's activeTarget. This prevents a race where switching worksheets
  // briefly uses the wrong target's availableActions.
  const worksheetTarget = targetsById.get(activeWorksheet.targetResourceId) ?? null;
  const actions = worksheetTarget?.availableActions;
  const canExecute = actions?.run === true;
  const isRedisTarget = worksheetTarget?.capability.editorMode === "redis";
  const isNativeCommandTarget = isRedisTarget || worksheetTarget?.capability.editorMode === "mongo";
  const worksheetTabs = isNativeCommandTarget ? WORKSHEET_TABS.filter((tab) => tab.id !== "savedStatements") : WORKSHEET_TABS;
  const displayedTab = isNativeCommandTarget && activeTab === "savedStatements" ? "worksheet" : activeTab;

  function activeMaxRowsDraftIsValid(): boolean {
    if (isRedisTarget) return true;
    const tracked = activeMaxRowsDraftValidityRef.current;
    return tracked.worksheetId !== activeWorksheetId || tracked.valid;
  }

  const activateWorksheet = useCallback((worksheetId: string) => {
    session.activate(worksheetId);
  }, [session]);

  function editActiveStatement(statement: string) {
    localWorkspaceChangedRef.current = true;
    session.editStatement(statement);
  }

  function loadSavedStatement(item: QuerySavedStatementRecord) {
    if (item.targetResourceId !== session.active.targetResourceId) return;
    localWorkspaceChangedRef.current = true;
    session.loadSavedStatement(item);
    if (worksheetTarget?.connectionContext.engine === "clickhouse") setActiveTab("worksheet");
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
    const editorMode = targetsById.get(worksheet.targetResourceId)?.capability.editorMode;
    const nativeCommand = editorMode === "redis" || editorMode === "mongo";
    if (worksheet.statement.trim() !== (nativeCommand ? "" : DEFAULT_STATEMENT) || worksheet.isDirty) {
      setCloseConfirmDialog({ open: true, worksheetId: id });
    } else {
      executeCloseWorksheet(id);
    }
  }

  function executeCloseWorksheet(id: string) {
    localWorkspaceChangedRef.current = true;
    session.close(id);
    setCloseConfirmDialog(null);
    setRenamingWorksheetId((current) => (current === id ? null : current));
    focusActiveTabAfterCloseRef.current = true;
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
    // Claim occupancy rows have no persisted id — they are non-interactive.
    if (record.kind !== "execution") return;
    session.openHistoryDetail(record.id);
  }

  function closeHistoryDetail() {
    setHistoryRestoreError(null);
    session.closeHistoryDetail();
  }

  async function restoreHistoryStatement(record: QueryExecutionRecord) {
    if (record.kind !== "execution" || !record.canRestore || isRestoringHistoryStatement) return;
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
        activeDatabase: record.database || sourceWorksheet.activeDatabase,
        activeSchema: record.schema || sourceWorksheet.activeSchema,
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
    // Already bound to the selection: picking the same target must not grow a
    // new worksheet (or mark the workspace changed).
    if (session.active.targetResourceId === activeTarget.resourceId) {
      return;
    }
    const canActivateBound = session.list.some(
      (ws) => ws.targetResourceId === activeTarget.resourceId,
    );
    if (!canActivateBound && session.list.length >= MAX_WORKSHEETS) {
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
      ...(request.schema !== undefined ? { schema: request.schema } : {}),
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
  const isPostgresTarget =
    worksheetTarget?.connectionContext.engine === "postgresql";
  const pgConnections = useMemo(
    () => (isPostgresTarget ? (worksheetTarget?.connections ?? []) : []),
    [isPostgresTarget, worksheetTarget?.connections],
  );
  const activeConnection = useMemo(
    () => pgConnections.find((row) => row.database === activeWorksheet.activeDatabase) ?? null,
    [pgConnections, activeWorksheet.activeDatabase],
  );
  // Resolved schema: explicit pin, otherwise the connection's default schema.
  const resolvedSchema =
    activeWorksheet.activeSchema ?? activeConnection?.defaultSchema ?? null;

  const lastInsertIdRef = useRef(0);
  useEffect(() => {
    if (!pendingInsertEvent || pendingInsertEvent.id === lastInsertIdRef.current) {
      return;
    }
    lastInsertIdRef.current = pendingInsertEvent.id;
    onInsertConsumed?.();
    const view = editorViewRef.current;
    if (!view) return;
    const { database, name, schema } = pendingInsertEvent.object;
    const text = objectIdentifier({
      database,
      name,
      activeDatabase: activeWorksheet.activeDatabase,
      schema,
      activeSchema: resolvedSchema,
      dialect: isPostgresTarget ? "postgresql" : "mysql",
    });
    insertIdentifierAtSelection(view, text);
  }, [
    pendingInsertEvent,
    onInsertConsumed,
    activeWorksheet.activeDatabase,
    resolvedSchema,
    isPostgresTarget,
  ]);
  const activeSchemaListing =
    isPostgresTarget && activeWorksheet.activeDatabase
      ? schemaStore.getSchemas(activeWorksheet.targetResourceId, activeWorksheet.activeDatabase)
      : { items: [], pageInfo: null, status: "idle" as const };
  const databaseListing = schemaStore.getDatabases(completionTargetId, COMPLETION_PAGE_SIZE);
  const objectListing = completionDatabase
    ? schemaStore.getObjects(
        completionTargetId,
        completionDatabase,
        COMPLETION_PAGE_SIZE,
        "",
        isPostgresTarget ? (resolvedSchema ?? "") : "",
      )
    : { items: [], pageInfo: null, status: "idle" as const };
  const metadataError =
    (!isPostgresTarget && databaseListing.status === "error") ||
    objectListing.status === "error" ||
    (isPostgresTarget && activeWorksheet.activeDatabase !== null && activeSchemaListing.status === "error");

  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    if (!worksheetTarget?.availableActions.run || worksheetTarget.capability.queryKind !== "sql" || worksheetTarget.connectionContext.engine === "clickhouse") return;
    if (isPostgresTarget) {
      // Composite targets enumerate connections from the target row; schemas
      // load lazily once a connection is selected.
      if (activeWorksheet.activeDatabase) {
        const listing = schemaStore.getSchemas(targetId, activeWorksheet.activeDatabase);
        if (listing.status === "idle" || listing.status === "error") {
          const controller = new AbortController();
          void schemaStore.ensureSchemas(targetId, activeWorksheet.activeDatabase, {
            signal: controller.signal,
          });
          return () => controller.abort();
        }
      }
      return;
    }
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
  }, [
    activeWorksheet.activeDatabase,
    activeWorksheet.targetResourceId,
    isPostgresTarget,
    metadataRetryKey,
    schemaStore,
    worksheetTarget?.capability.queryKind,
    worksheetTarget?.connectionContext.engine,
    worksheetTarget?.availableActions.run,
  ]);

  // Restored/persisted PostgreSQL context is revalidated against the live
  // connection enumeration: a vanished or disabled connection stops the
  // worksheet's context instead of silently falling back.
  useEffect(() => {
    if (!isPostgresTarget || pgConnections.length === 0) return;
    session.reconcileConnection(
      activeWorksheet.id,
      pgConnections.map((row) => row.database),
    );
  }, [activeWorksheet.id, isPostgresTarget, pgConnections, session]);

  useEffect(() => {
    if (isPostgresTarget) return;
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
    isPostgresTarget,
    schemaStore,
  ]);

  const effectiveCompletionDatabase = isNativeCommandTarget || worksheetTarget?.connectionContext.engine === "clickhouse" ? null : isPostgresTarget
    ? activeWorksheet.activeDatabase
    : activeWorksheet.activeDatabase ?? schemaStore.getDefaultDatabase(activeWorksheet.targetResourceId);

  useEffect(() => {
    const targetId = activeWorksheet.targetResourceId;
    if (!worksheetTarget?.availableActions.run || !effectiveCompletionDatabase) return;
    const controller = new AbortController();
    const objects = schemaStore.getObjects(
      targetId,
      effectiveCompletionDatabase,
      COMPLETION_PAGE_SIZE,
      "",
      isPostgresTarget ? (resolvedSchema ?? "") : "",
    );
    if (objects.status === "idle" || objects.status === "error") {
      void schemaStore.ensureObjects(targetId, effectiveCompletionDatabase, {
        page: 1,
        pageSize: COMPLETION_PAGE_SIZE,
        replace: true,
        ...(isPostgresTarget && resolvedSchema ? { schema: resolvedSchema } : {}),
        signal: controller.signal,
      });
    }
    return () => controller.abort();
  }, [
    activeWorksheet.targetResourceId,
    effectiveCompletionDatabase,
    isPostgresTarget,
    metadataRetryKey,
    resolvedSchema,
    schemaStore,
    worksheetTarget?.availableActions.run,
  ]);

  function retryMetadata() {
    const targetId = activeWorksheet.targetResourceId;
    if (isPostgresTarget) {
      if (activeWorksheet.activeDatabase) {
        schemaStore.invalidateSchemas(targetId, activeWorksheet.activeDatabase);
        schemaStore.invalidateObjects(
          targetId,
          activeWorksheet.activeDatabase,
          COMPLETION_PAGE_SIZE,
          "",
          resolvedSchema ?? "",
        );
      }
    } else {
      schemaStore.invalidateDatabases(targetId, COMPLETION_PAGE_SIZE);
      if (activeWorksheet.activeDatabase) {
        schemaStore.invalidateObjects(targetId, activeWorksheet.activeDatabase, COMPLETION_PAGE_SIZE, "");
      }
    }
    setMetadataRetryKey((key) => key + 1);
  }

  useEffect(() => {
    onActiveDatabaseChange?.(activeWorksheet.activeDatabase);
  }, [activeWorksheet.activeDatabase, onActiveDatabaseChange]);

  const templateMode = activeWorksheet.templateStatementId !== null;
  const templateValuesReady =
    !templateMode ||
    worksheetTarget?.connectionContext.engine === "clickhouse" ||
    activeWorksheet.parameters.every(
      (parameter) => (activeWorksheet.parameterValues[parameter.name] ?? "").trim() !== "",
    );
  const runEnabled =
    canExecute &&
    !activeWorksheet.isExecuting &&
    activeWorksheet.statement.trim() !== "" &&
    templateValuesReady &&
    (!isPostgresTarget || activeWorksheet.activeDatabase !== null);

  function handleParameterValueChange(name: string, value: string) {
    session.setParameterValue(name, value);
  }

  const editorThemePreference = normalizeEditorTheme(
    theme === "system" ? resolvedTheme ?? "system" : theme,
  );

  // Hydration: read persisted editor height after mount (cannot read localStorage during SSR).
  useEffect(() => {
    const storedHeight = parseStoredEditorHeight(
      window.localStorage.getItem(QUERY_EDITOR_HEIGHT_STORAGE_KEY),
    );
    if (storedHeight !== null) {
      setEditorHeight(storedHeight);
    }
  }, []);

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

  function handleCancel() {
    session.cancel();
  }

  function handleRefreshCancellation() {
    session.refreshCancellation();
  }

  // Run/Explain share one scope: an editor selection, else the statement
  // under the cursor for SQL engines (whole document for native commands).
  // Template-bound worksheets ignore editor scope and run as before.
  function editorRunScopeText(): string | undefined {
    if (templateMode) return undefined;
    const view = editorViewRef.current;
    if (!view) return undefined;
    return resolveWorksheetRunScope(view.state, worksheetTarget?.connectionContext.engine).text;
  }

  async function handleRun() {
    if (!runEnabled || !activeMaxRowsDraftIsValid()) {
      return;
    }
    await session.run(editorRunScopeText());
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
    await session.explain(editorRunScopeText());
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
      <div className="flex items-center gap-1 border-b border-border bg-muted/30 px-2 py-1">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label={t("editor.worksheetTab")}>
          {worksheets.map((ws) => (
            <button
              key={ws.id}
              type="button"
              id={`ws-tab-${ws.id}`}
              role="tab"
              aria-selected={ws.id === activeWorksheetId}
              aria-controls="worksheet-content"
              tabIndex={ws.id === activeWorksheetId ? 0 : -1}
              className={cn(
                "px-3 py-1.5 text-sm cursor-pointer rounded-t-md",
                ws.id === activeWorksheetId
                  ? "bg-background border border-border border-b-transparent"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("[data-close-worksheet]")) {
                  closeWorksheet(ws.id);
                  return;
                }
                if (ws.id !== activeWorksheetId) {
                  activateWorksheet(ws.id);
                }
              }}
              onKeyDown={(e) => {
                const tabs = worksheets.map((w) => w.id);
                const currentIndex = tabs.indexOf(ws.id);
                const focusTab = (id: string) => {
                  activateWorksheet(id);
                  document.getElementById(`ws-tab-${id}`)?.focus();
                };
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  focusTab(tabs[(currentIndex + 1) % tabs.length]!);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  focusTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]!);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  focusTab(tabs[0]!);
                } else if (e.key === "End") {
                  e.preventDefault();
                  focusTab(tabs[tabs.length - 1]!);
                } else if (e.key === "Delete") {
                  e.preventDefault();
                  closeWorksheet(ws.id);
                } else if (e.key === "F2") {
                  e.preventDefault();
                  if (ws.id !== activeWorksheetId) {
                    activateWorksheet(ws.id);
                  }
                  startRename(ws.id, ws.name);
                }
              }}
              onDoubleClick={() => {
                if (ws.id !== activeWorksheetId) {
                  activateWorksheet(ws.id);
                }
                startRename(ws.id, ws.name);
              }}
            >
              {ws.name}
              {ws.isDirty && (
                <span className="ml-1 text-muted-foreground" aria-label={t("editor.unsavedChanges")}>•</span>
              )}
              {worksheets.length > 1 && (
                <span data-close-worksheet aria-hidden="true" className="ml-1 text-muted-foreground">×</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={addWorksheet}
          className="ml-1 shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={t("editor.addWorksheet")}
        >
          +
        </button>
        {renamingWorksheetId === null ? (
          <>
            <button
              type="button"
              onClick={() => {
                if (activeWorksheet) startRename(activeWorksheet.id, activeWorksheet.name);
              }}
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={t("editor.renameWorksheet", { name: activeWorksheet?.name ?? "" })}
            >
              ✎
            </button>
            {worksheets.length > 1 && (
              <button
                type="button"
                onClick={() => closeWorksheet(activeWorksheetId)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
                aria-label={t("editor.closeWorksheet", { name: activeWorksheet?.name ?? "" })}
              >
                ×
              </button>
            )}
          </>
        ) : (
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={() => renameWorksheet(renamingWorksheetId, renameValue)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                renameWorksheet(renamingWorksheetId, renameValue);
              } else if (e.key === "Escape") {
                setRenamingWorksheetId(null);
              }
            }}
            aria-label={t("editor.renameWorksheetInput", { name: worksheets.find((w) => w.id === renamingWorksheetId)?.name ?? "" })}
            className="w-28 shrink-0 bg-transparent px-2 py-1 text-sm outline-none"
            autoFocus
          />
        )}
      </div>

      <div
        id="worksheet-content"
        role="tabpanel"
        aria-labelledby={`ws-tab-${activeWorksheetId}`}
        className="flex min-w-0 flex-col"
      >
      <div className="flex items-center justify-between border-b border-border bg-muted/30">
        <div role="tablist" aria-label={t("editor.sectionsTab")} className="flex flex-wrap">
          {worksheetTabs.map((tab, index) => {
            const active = tab.id === displayedTab;
            return (
              <button
                key={tab.id}
                type="button"
                id={`section-tab-${tab.id}`}
                role="tab"
                aria-selected={active}
                aria-controls={active ? `section-panel-${tab.id}` : undefined}
                tabIndex={active ? 0 : -1}
                onKeyDown={(e) => {
                  const tabs = worksheetTabs;
                  const focusTab = (id: WorksheetTab) => {
                    selectWorksheetTab(id);
                    document.getElementById(`section-tab-${id}`)?.focus();
                  };
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    focusTab(tabs[(index + 1) % tabs.length]!.id);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    focusTab(tabs[(index - 1 + tabs.length) % tabs.length]!.id);
                  } else if (e.key === "Home") {
                    e.preventDefault();
                    focusTab(tabs[0]!.id);
                  } else if (e.key === "End") {
                    e.preventDefault();
                    focusTab(tabs[tabs.length - 1]!.id);
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
            );
          })}
        </div>
        <div className="hidden items-center gap-2 pr-3 text-xs text-muted-foreground sm:flex">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
            {t("editor.readonlyBadge")}
          </Badge>
          {!isRedisTarget && <><span>{t("editor.timeout")}</span><span>{t("editor.maxRows")}</span></>}
        </div>
      </div>

      {worksheetTarget ? (
        <>
          <QueryGovernancePanel target={worksheetTarget} />
          {!isRedisTarget && <QueryObjectQuickNavigator
            catalog={schemaStore}
            targetId={activeWorksheet.targetResourceId}
            activeDatabase={activeWorksheet.activeDatabase}
            activeSchema={resolvedSchema}
            connections={isPostgresTarget ? pgConnections : undefined}
            onDatabaseSelect={(activeDatabase) => {
              localWorkspaceChangedRef.current = true;
              if (isPostgresTarget) {
                session.selectConnection(activeWorksheet.id, activeDatabase);
              } else {
                session.setActiveDatabase(activeDatabase);
              }
            }}
            onSchemaSelect={(schema) => {
              localWorkspaceChangedRef.current = true;
              session.selectSchema(activeWorksheet.id, schema);
            }}
            onInsertObject={({ database, name, schema }) => {
              const view = editorViewRef.current;
              if (!view) return;
              const text = objectIdentifier({
                database,
                name,
                activeDatabase: activeWorksheet.activeDatabase,
                schema,
                activeSchema: resolvedSchema,
                dialect: isPostgresTarget ? "postgresql" : "mysql",
              });
              insertIdentifierAtSelection(view, text);
            }}
          />}
          {isPostgresTarget ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2" data-testid="pg-context-bar">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>{t("schema.connectionLabel")}</span>
                <select
                  value={activeWorksheet.activeDatabase ?? ""}
                  onChange={(event) => {
                    localWorkspaceChangedRef.current = true;
                    session.selectConnection(activeWorksheet.id, event.target.value);
                  }}
                  aria-label={t("schema.connectionLabel")}
                  data-testid="pg-connection-select"
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="" disabled>
                    {t("schema.connectionPlaceholder")}
                  </option>
                  {pgConnections.map((row) => (
                    <option key={row.database} value={row.database} disabled={row.enabled === false}>
                      {row.database}
                      {row.enabled === false ? ` (${t("schema.connectionDisabledBadge")})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              {activeWorksheet.activeDatabase ? (
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{t("schema.schemaLabel")}</span>
                  <select
                    value={activeWorksheet.activeSchema ?? ""}
                    onChange={(event) => {
                      localWorkspaceChangedRef.current = true;
                      session.selectSchema(
                        activeWorksheet.id,
                        event.target.value === "" ? null : event.target.value,
                      );
                    }}
                    aria-label={t("schema.schemaLabel")}
                    data-testid="pg-schema-select"
                    disabled={activeSchemaListing.status === "loading"}
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">
                      {t("schema.schemaDefault", {
                        schema: activeConnection?.defaultSchema ?? "",
                      })}
                    </option>
                    {activeSchemaListing.items.map((schema) => (
                      <option key={schema} value={schema}>
                        {schema}
                      </option>
                    ))}
                    {activeWorksheet.activeSchema !== null &&
                    activeSchemaListing.status === "ready" &&
                    !activeSchemaListing.items.includes(activeWorksheet.activeSchema) ? (
                      <option value={activeWorksheet.activeSchema} disabled>
                        {t("schema.schemaMissingOption", { schema: activeWorksheet.activeSchema })}
                      </option>
                    ) : null}
                  </select>
                </label>
              ) : null}
            </div>
          ) : effectiveCompletionDatabase ? (
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground" data-testid="mysql-context-bar">
              <span>{t("schema.mysqlDatabase", { database: effectiveCompletionDatabase })}</span>
              <span>{t("schema.mysqlDatabaseHint")}</span>
            </div>
          ) : null}
        </>
      ) : (
        <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          <span>{t("workspace.targetUnavailable")}</span>
          {activeTarget.availableActions.run === true ? (
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
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onChooseTarget}
            >
              {t("workspace.chooseTarget")}
            </Button>
          )}
        </div>
      )}

      {displayedTab === "worksheet" ? (
        canExecute ? (
          <div id="section-panel-worksheet" role="tabpanel" aria-labelledby="section-tab-worksheet">
            <ReadyWorksheet
              key={worksheetTarget?.clickHouseGeneration && `${worksheetTarget.resourceId}:${worksheetTarget.clickHouseGeneration}`}
              worksheetId={activeWorksheet.id}
              statement={activeWorksheet.statement}
              onStatementChange={(value) => {
                editActiveStatement(value);
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
              onCancel={handleCancel}
              onRefreshCancellation={handleRefreshCancellation}
              cancellation={activeWorksheet.cancellation}
              explainEnabled={
                !templateMode &&
                actions?.explain === true &&
                activeWorksheet.statement.trim() !== ""
              }
              exportEnabled={actions?.export === true}
              explainState={activeWorksheet.explain}
              onExplain={handleExplain}
              onCloseExplain={handleCloseExplain}
              onFormat={isNativeCommandTarget ? undefined : handleFormat}
              onEditorView={(view) => { editorViewRef.current = view; }}
              formatError={activeWorksheet.formatError}
              clickHouseNamespace={
                clickHouseCatalog && worksheetTarget?.resourceId === clickHouseCatalog.identity.targetId &&
                worksheetTarget.clickHouseGeneration === clickHouseCatalog.identity.generation
                  ? clickHouseCatalog.namespace : undefined
              }
              engine={targetsById.get(activeWorksheet.targetResourceId)?.connectionContext.engine}
              themePreference={editorThemePreference}
              editorHeight={editorHeight}
              onEditorResizePointerDown={handleEditorResizePointerDown}
              onEditorResizeCommit={handleEditorResizeCommit}
              result={activeWorksheet.result}
              error={activeWorksheet.error}
              schemaStore={schemaStore}
              targetId={activeWorksheet.targetResourceId}
              activeDatabase={effectiveCompletionDatabase}
              activeSchema={resolvedSchema}
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
                <Lock className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
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
      ) : displayedTab === "history" && canExecute ? (
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
              (item): item is QueryExecutionHistoryExecution =>
                item.kind === "execution" && item.id === activeWorksheet.history.selectedRecordId,
            ) ?? null}
            onOpenDetail={openHistoryDetail}
            onCloseDetail={closeHistoryDetail}
            onRestoreStatement={restoreHistoryStatement}
            restoreError={historyRestoreError}
            isRestoringStatement={isRestoringHistoryStatement}
            restoreBlocked={worksheets.length >= MAX_WORKSHEETS}
          />
        </div>
      ) : displayedTab === "savedStatements" && worksheetTarget ? (
        <div id="section-panel-savedStatements" role="tabpanel" aria-labelledby="section-tab-savedStatements">
          <QuerySavedStatements
            clickHouse={worksheetTarget.connectionContext.engine === "clickhouse"}
            clickHouseGeneration={worksheetTarget.availableActions.saveSheet ? worksheetTarget.clickHouseGeneration : undefined}
            targetResourceId={activeWorksheet.targetResourceId}
            database={
              isPostgresTarget
                ? (activeWorksheet.activeDatabase ?? undefined)
                : undefined
            }
            schema={
              isPostgresTarget
                ? (activeWorksheet.activeSchema ?? undefined)
                : undefined
            }
            currentStatement={activeWorksheet.statement}
            onStatementLoad={loadSavedStatement}
          />
        </div>
      ) : null}
      </div>

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
                  <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
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
                <p id={errorId} role="alert" className="pl-[8.5rem] text-xs text-rose-700 dark:text-rose-400">
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
  onCancel,
  onRefreshCancellation,
  cancellation,
  explainEnabled,
  explainState,
  onExplain,
  onCloseExplain,
  onFormat,
  onEditorView,
  formatError,
  engine,
  clickHouseNamespace,
  themePreference,
  editorHeight,
  onEditorResizePointerDown,
  onEditorResizeCommit,
  result,
  error,
  schemaStore,
  targetId,
  activeDatabase,
  activeSchema,
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
  onCancel: () => void;
  onRefreshCancellation: () => void;
  cancellation: CancellationState;
  explainEnabled: boolean;
  explainState: ExplainState;
  onExplain: () => void;
  onCloseExplain: () => void;
  onFormat?: () => void;
  onEditorView?: (view: EditorView) => void;
  formatError: string | null;
  engine?: string;
  clickHouseNamespace?: SchemaNamespace;
  themePreference: QueryEditorThemePreference;
  editorHeight: number;
  onEditorResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onEditorResizeCommit: (height: number) => void;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
  schemaStore: SchemaCatalog;
  targetId: number;
  activeDatabase: string | null;
  activeSchema: string | null;
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
    activeSchema ?? undefined,
    engine === "postgresql",
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
  const redis = engine === "redis";
  const mongo = engine === "mongodb";
  const canRun = runEnabled && (redis || draftResult.valid);
  const statementLabel = t(redis ? "editor.redisCommandLabel" : "editor.statementLabel");
  const [runScope, setRunScope] = useState<WorksheetRunScope>("document");
  // Template-bound runs ignore selection/cursor and send the draft as before,
  // so the Run description stays the unscoped one in that mode.
  const effectiveScope = templateMode ? "document" : runScope;
  const runScopeLabel = t(
    effectiveScope === "selection"
      ? "editor.runScopeSelection"
      : effectiveScope === "statement"
        ? "editor.runScopeStatement"
        : "editor.runScopeDocument",
  );

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button
          ref={runButtonRef}
          type="button"
          size="sm"
          disabled={!canRun}
          onClick={onRun}
          title={runScopeLabel}
          aria-description={runScopeLabel}
        >
          <Play className="size-3.5" aria-hidden />
          {t("editor.runReady")}
        </Button>
        {isExecuting ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onCancel}
            disabled={cancellation.phase !== "idle"}
            data-testid="cancel-execution"
          >
            {cancellation.phase === "requested" ? t("editor.cancelling") : t("editor.cancel")}
          </Button>
        ) : null}
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
        {onFormat && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onFormat}
            disabled={isExecuting || explainLoading}
          >
            {t("editor.format")}
          </Button>
        )}
        {!redis && <label className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground">
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
            <p id="max-rows-range-error" role="alert" className="ml-1 text-xs text-rose-700 dark:text-rose-400">
              {t("editor.maxRowsRangeError")}
            </p>
          )}
        </label>}
        <span className="ml-auto text-xs text-muted-foreground">
          {isExecuting ? t("editor.runReady") : t("editor.ready")}
        </span>
        <span data-testid="provenance-state" data-has-provenance={!!previewProvenance} className="sr-only" />
      </div>

      {cancellation.phase === "resolved" ? (
        <div
          role="status"
          data-testid="cancel-outcome"
          className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          {cancellation.outcome.kind === "terminal" && cancellation.outcome.remoteState === "stopped"
            ? t("editor.cancelOutcomeStopped")
            : cancellation.outcome.kind === "terminal"
              ? t("editor.cancelOutcomeTerminal", { status: cancellation.outcome.status })
              : cancellation.outcome.kind === "running"
                ? t("editor.cancelOutcomeRunning")
                : t("editor.cancelOutcomeUnknown")}
          {cancellation.outcome.kind !== "terminal" ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onRefreshCancellation}
              data-testid="cancel-outcome-refresh"
            >
              {t("editor.cancelOutcomeRefresh")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="border-b border-border bg-muted/20 p-3">
        <label className="mb-1 block font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {statementLabel}
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
          ariaLabel={statementLabel}
          disabled={isExecuting || explainLoading}
          themePreference={themePreference}
          height={editorHeight}
          schemaNamespace={engine === "clickhouse" ? clickHouseNamespace : namespace}
          columnFetcher={engine === "clickhouse" ? undefined : columnFetcher}
          onRunScopeChange={setRunScope}
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
          <ExecuteErrorPanel error={error} onRetry={onRun} engine={mongo ? "mongo" : redis ? "redis" : undefined} />
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
        {safeResult.truncated ? <dd className="font-medium text-amber-700 dark:text-amber-400">{t("result.truncated")}</dd> : null}
        <dd>
          {t("result.executionIdLabel")} {safeResult.executionId}
        </dd>
        <dd>
          {t("result.executedAtLabel")} {safeResult.executedAt}
        </dd>
      </dl>

      {safeResult.cellTruncated.some((row) => row.some((flag) => flag)) ? (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-300"
          data-testid="truncated-page-notice"
        >
          {t("result.truncatedPageNotice")}
        </p>
      ) : null}

      <ResultTable key={safeResult.executionId} columns={safeResult.columns} rows={safeResult.rows} cellTruncated={safeResult.cellTruncated} navigationCapability={navigationCapability} relatedRecordsTriggerRef={relatedRecordsTriggerRef} onRelatedRecordsIneligible={onRelatedRecordsIneligible} exportEnabled={exportEnabled} pageViewEnabled />
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
              {safeResponse.truncated ? <dd className="font-medium text-amber-700 dark:text-amber-400">{t("result.relatedRecordsTruncated")}</dd> : null}
            </dl>
            <ResultTable key={safeResponse.executionId} columns={safeResponse.columns} rows={safeResponse.rows} cellTruncated={safeResponse.cellTruncated} exportEnabled={false} />
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
  const [view, setView] = useState<"cards" | "text">("cards");

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
        <h3 className="text-sm font-medium text-foreground">
          {t("explain.title")}
          {state.status === "ready" && state.response ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {state.response.engine}
            </span>
          ) : null}
          {state.status === "ready" && state.response ? (
            <span className="ml-3 inline-flex rounded-md border border-border text-xs" role="group" aria-label={t("explain.viewSwitch")}>
              <button
                type="button"
                className={cn("px-2 py-0.5", view === "cards" ? "bg-muted font-medium" : "text-muted-foreground")}
                aria-pressed={view === "cards"}
                onClick={() => setView("cards")}
              >
                {t("explain.viewCards")}
              </button>
              <button
                type="button"
                className={cn("px-2 py-0.5", view === "text" ? "bg-muted font-medium" : "text-muted-foreground")}
                aria-pressed={view === "text"}
                onClick={() => setView("text")}
              >
                {t("explain.viewText")}
              </button>
            </span>
          ) : null}
        </h3>
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
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
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
          ) : (() => {
            // Nodes arrive depth-first with monotonic ids; parents always
            // precede children, so one pass resolves every depth.
            const depthById = new Map<string, number>();
            for (const n of state.response.nodes) {
              depthById.set(
                n.id,
                n.parentId != null ? (depthById.get(n.parentId) ?? 0) + 1 : 0,
              );
            }
            if (view === "text") {
              const lines = state.response.nodes.map((node) => {
                const depth = depthById.get(node.id) ?? 0;
                const name = node.label ?? t(`explain.operations.${node.operation}`);
                // Planner-vocabulary labels read "Index Scan on t using i";
                // translated operations read "索引访问 t (i)".
                const ref = node.label
                  ? `${node.relation ? ` on ${node.relation}` : ""}${node.index ? ` using ${node.index}` : ""}`
                  : `${node.relation ? ` ${node.relation}` : ""}${node.index ? ` (${node.index})` : ""}`;
                const meta = [
                  node.totalCost !== undefined
                    ? `cost=${(node.startupCost ?? node.totalCost).toFixed(2)}..${node.totalCost.toFixed(2)}`
                    : null,
                  node.primaryKeyGranules ? t("explain.primaryKeyGranules", node.primaryKeyGranules) : null,
                  node.estimatedRows !== undefined ? `rows=${node.estimatedRows}` : null,
                ].filter(Boolean).join(" ");
                return `${"  ".repeat(depth)}${name}${ref}${meta ? `  (${meta})` : ""}`;
              });
              return (
                <pre
                  className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-xs leading-6 text-foreground"
                  data-testid="explain-text"
                ><code>{lines.join("\n")}</code></pre>
              );
            }
            return (
            <ul className="space-y-2" data-testid="explain-nodes">
              {state.response.nodes.map((node) => {
                  const depth = depthById.get(node.id) ?? 0;
                  return (
                    <li
                      key={node.id}
                      className={cn(
                        "rounded-md border border-border bg-background/60 px-3 py-2 text-sm",
                        depth > 0 && "border-l-2 border-l-primary/30",
                      )}
                      style={{ marginLeft: depth * 20 }}
                      aria-label={t("explain.nodeAriaLabel", {
                        id: node.id,
                        operation: node.label ?? t(`explain.operations.${node.operation}`),
                      })}
                      data-node-id={node.id}
                      data-node-operation={node.operation}
                      data-node-access={node.access}
                      data-node-depth={depth}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">
                          {node.label ?? t(`explain.operations.${node.operation}`)}
                        </span>
                        {node.label ? (
                          <span className="text-xs text-muted-foreground">
                            {t(`explain.operations.${node.operation}`)}
                          </span>
                        ) : null}
                        {node.relation ? (
                          <span className="font-mono text-xs text-foreground">
                            {node.relation}
                          </span>
                        ) : null}
                        {node.index ? (
                          <span className="font-mono text-xs text-muted-foreground">
                            {node.index}
                          </span>
                        ) : null}
                        {node.access !== "unknown" ||
                        node.operation === "table_access" ||
                        node.operation === "index_access" ? (
                          <Badge variant="secondary">{t(`explain.access.${node.access}`)}</Badge>
                        ) : null}
                        {node.totalCost !== undefined ? (
                          <span className="text-xs text-muted-foreground">
                            cost={(node.startupCost ?? node.totalCost).toFixed(2)}..{node.totalCost.toFixed(2)}
                          </span>
                        ) : null}
                        {node.primaryKeyGranules && (
                          <span className="text-xs text-muted-foreground">{t("explain.primaryKeyGranules", node.primaryKeyGranules)}</span>
                        )}
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
                  );
                })}
            </ul>
            );
          })()}
        </div>
      )}
    </div>
  );
}

const RESULT_COLUMN_MIN_WIDTH = 104;
const RESULT_COLUMN_MAX_WIDTH = 640;
const RESULT_COLUMN_DEFAULT_WIDTH = 160;
const RESULT_COLUMN_KEY_STEP = 16;

/**
 * Roving-focus grid for a single delivered result page. Arrow keys move focus
 * and Enter/Space select a cell or header; Shift extends a data-cell range.
 * Execution-keyed remounts reset selection and column widths together.
 */
function ResultTable({
  columns,
  rows: deliveredRows,
  cellTruncated: deliveredTruncation,
  navigationCapability,
  relatedRecordsTriggerRef,
  onRelatedRecordsIneligible,
  exportEnabled,
  pageViewEnabled = false,
}: {
  columns: QueryExecuteResponse["columns"];
  rows: QueryExecuteResponse["rows"];
  cellTruncated: readonly (readonly boolean[])[];
  navigationCapability?: NavigationCapability;
  relatedRecordsTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  onRelatedRecordsIneligible?: () => void;
  exportEnabled: boolean;
  pageViewEnabled?: boolean;
}) {
  const t = useTranslations("queryWorkbench");
  const gridDescriptionId = useId();

  // Display-only page view: sort/filter reorder and hide *aligned* view rows;
  // the delivered page stays the source of truth for export and paging.
  const [sort, setSort] = useState<ResultPageSort | null>(null);
  const [filter, setFilter] = useState<ResultPageFilter | null>(null);
  const filterableColumns = pageViewEnabled
    ? columns.flatMap((column, index) => isColumnCopyable(column) ? [{ column, index }] : [])
    : [];
  const { rows, cellTruncated } = useMemo(
    () => viewQueryResultPage({ columns, rows: deliveredRows, cellTruncated: deliveredTruncation }, sort, filter),
    [columns, deliveredRows, deliveredTruncation, sort, filter],
  );

  // Roving-tabindex active cell. row = -1 means the header row.
  // Initialized to the first data cell so Tab can enter the grid.
  const [activeCell, setActiveCell] = useState<ResultCellPoint>({ row: 0, col: 0 });
  // Ref map for programmatic focus during arrow-key navigation.
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());

  // Per-column widths are presentation-only: never persisted, never part of
  // the governed payload, and reset on each executionId-keyed remount.
  const [columnWidths, setColumnWidths] = useState(() => columns.map(() => RESULT_COLUMN_DEFAULT_WIDTH));
  const resizeDrag = useRef<{ pointerId: number; column: number; startX: number; width: number } | null>(null);

  function adjustColumnWidth(column: number, delta: number, startWidth?: number) {
    setColumnWidths((widths) => widths.map((width, index) => index === column
      ? Math.max(RESULT_COLUMN_MIN_WIDTH, Math.min(RESULT_COLUMN_MAX_WIDTH, (startWidth ?? width) + delta))
      : width));
  }

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

  // Selection for copy (distinct from keyboard focus): an anchor/end pair
  // describing one rectangular range; single-cell selection is a 1x1 range.
  const [selection, setSelection] = useState<{ anchor: ResultCellPoint; end: ResultCellPoint } | null>(null);
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

  // Per-cell truncation flags follow the validated matrix positionally — the
  // grid never re-derives them from value length or column names.
  function isCellTruncated(rowIndex: number, colIndex: number): boolean {
    return cellTruncated[rowIndex]?.[colIndex] === true;
  }

  // Whole-page eligibility mirrors the serializer boundary: a non-copyable
  // column or corrupt matrix disables the control, not only truncation. The
  // gate and download use the delivered page, never the sorted/filtered view.
  const pageExportable = isQueryResultExportable(columns, deliveredRows, deliveredTruncation);

  // The current selection normalized to one rectangle. Multi-cell ranges are
  // copy-only: single-cell affordances (viewer, related records) stay bound to
  // a 1x1 selection so they never act on a rectangle.
  const range = selection ? resultRangeBetween(selection.anchor, selection.end) : null;
  const isMultiCell = !!range && (range.top !== range.bottom || range.left !== range.right);
  const selectedCell = isMultiCell ? null : selection?.end ?? null;
  const resultPage = { columns, rows, cellTruncated };
  const copyRefusal = range ? resultRangeCopyRefusal(resultPage, range) : null;

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
        const cellValue = rows[selectedCell.row]?.[colIndex];
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

  function selectCellAt(point: ResultCellPoint, extendFrom?: ResultCellPoint) {
    setSelection((current) => ({ anchor: extendFrom ? current?.anchor ?? extendFrom : point, end: point }));
    setSelectedHeader(null);
  }

  function selectHeaderAt(colIndex: number) {
    setSelectedHeader({ colIndex, name: columns[colIndex]?.name ?? "" });
    setSelection(null);
  }

  function handleCellClick(row: number, col: number, extend: boolean) {
    const point = { row, col };
    setActiveCell(point);
    selectCellAt(point, extend ? point : undefined);
    if (extend) focusCell(row, col);
  }

  function handleHeaderClick(col: number) {
    setActiveCell({ row: -1, col });
    selectHeaderAt(col);
  }

  function resetViewSelection(active: ResultCellPoint = { row: 0, col: 0 }) {
    setSelection(null);
    setSelectedHeader(null);
    setActiveCell(active);
  }

  function cycleSort(column: number) {
    if (!pageViewEnabled || !isColumnCopyable(columns[column])) return;
    setSort((current) => current?.column !== column ? { column, direction: "ascending" }
      : current.direction === "ascending" ? { column, direction: "descending" } : null);
    resetViewSelection({ row: -1, col: column });
    focusCell(-1, column);
  }

  function handleGridKeyDown(event: React.KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "c" && isMultiCell) {
      event.preventDefault();
      void handleCopy();
      return;
    }
    const { row, col } = activeCell;
    const key = event.key;
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
      event.preventDefault();
      const horizontal = key === "ArrowLeft" || key === "ArrowRight";
      if (event.shiftKey && row === -1 && horizontal) {
        adjustColumnWidth(col, (key === "ArrowRight" ? 1 : -1) * RESULT_COLUMN_KEY_STEP);
        return;
      }
      const next = {
        row: Math.max(event.shiftKey && row >= 0 ? 0 : -1, Math.min(rowCount - 1, row + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0))),
        col: Math.max(0, Math.min(colCount - 1, col + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0))),
      };
      if (event.shiftKey && row >= 0) selectCellAt(next, activeCell);
      setActiveCell(next);
      focusCell(next.row, next.col);
      return;
    }
    if (key === "Enter" && event.shiftKey && row === -1 && pageViewEnabled && isColumnCopyable(columns[col])) {
      event.preventDefault();
      cycleSort(col);
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (row === -1) selectHeaderAt(col);
      else selectCellAt(activeCell);
    } else if (key === "Escape" && isMultiCell) {
      event.preventDefault();
      setSelection(null);
    }
  }

  function handleExport(format: "csv" | "json") {
    if (!exportEnabled || !pageExportable) return;
    let text: string;
    try {
      const serialize = format === "csv" ? serializeQueryResultCsv : serializeQueryResultJson;
      text = serialize(columns, deliveredRows, deliveredTruncation);
    } catch {
      showFeedback(t(format === "csv" ? "result.exportCsvBlocked" : "result.exportJsonBlocked"), "error");
      return;
    }
    const mime = format === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8";
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `query-results.${format}`;
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
    if (range) {
      const refusal = resultRangeCopyRefusal(resultPage, range);
      if (refusal) {
        showFeedback(t(isMultiCell ? "result.copyRangeBlocked" : refusal === "truncated" ? "result.copyTruncatedBlocked" : "result.copyNotAllowed"), "error");
        return;
      }
      if (isMultiCell) {
        const tsv = serializeResultRangeTsv(resultPage, range);
        if (tsv === null) return;
        text = tsv;
      } else {
        text = getCellCopyText(rows[range.top]?.[range.left] ?? null);
      }
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
    if (isMultiCell) {
      return t(copyRefusal ? "result.copyRangeBlocked" : "result.copyRange");
    }
    if (range) {
      if (copyRefusal === "truncated") {
        return t("result.copyTruncatedBlocked");
      }
      if (copyRefusal !== null) {
        return t("result.copyNotAllowed");
      }
      return t("result.copyCellAriaLabel", { value: getCellCopyText(rows[range.top]?.[range.left] ?? null) });
    }
    if (selectedHeader) {
      return t("result.copyColumnNameAriaLabel", { name: selectedHeader.name });
    }
    return t("result.copyCellValue");
  }

  const viewerValue = selectedCell ? rows[selectedCell.row]?.[selectedCell.col] : undefined;
  const viewerColumn = selectedCell ? columns[selectedCell.col] : undefined;
  const viewableCell = selectedCell && viewerColumn && isColumnCopyable(viewerColumn) &&
    cellTruncated[selectedCell.row]?.[selectedCell.col] === false &&
    typeof viewerValue === "string" && viewerValue.length > 0
    ? { name: viewerColumn.name, value: viewerValue }
    : null;

  if (deliveredRows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("result.noRows")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={(!range && !selectedHeader) || copyRefusal !== null}
          onClick={() => void handleCopy()}
          title={t(isMultiCell && copyRefusal ? "result.copyRangeBlocked" : "result.gridSelectionHelp")}
          aria-label={copyButtonLabel()}
          data-testid="copy-selection"
        >
          <Copy className="size-3.5" aria-hidden />
          {t(isMultiCell ? "result.copyRange" : "result.copyCellValue")}
        </Button>
        <QueryResultCellViewer
          key={viewableCell && selectedCell ? `${selectedCell.row}:${selectedCell.col}` : "unavailable"}
          cell={viewableCell}
        />
        {exportEnabled && <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleExport("csv")}
          disabled={!pageExportable}
          title={!pageExportable ? t("result.exportCsvBlocked") : undefined}
          aria-label={!pageExportable ? t("result.exportCsvBlocked") : undefined}
          data-testid="export-csv"
        >
          <Download className="size-3.5" aria-hidden />
          {t("result.exportCsv")}
        </Button>}
        {exportEnabled && <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => handleExport("json")}
          disabled={!pageExportable}
          title={!pageExportable ? t("result.exportJsonBlocked") : undefined}
          aria-label={!pageExportable ? t("result.exportJsonBlocked") : undefined}
          data-testid="export-json"
        >
          <Download className="size-3.5" aria-hidden />
          {t("result.exportJson")}
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
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-700 dark:text-rose-400",
            )}
          >
            {copyFeedback.type === "success" ? (
              <Check className="mr-0.5 inline-block size-3" aria-hidden />
            ) : null}
            {copyFeedback.message}
          </span>
        )}
      </div>
      {filterableColumns.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-border bg-muted/20 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium">{t("result.pageView")}</span>
            <select
              aria-label={t("result.filterColumn")}
              value={filter?.column ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setFilter(value === "" ? null : { column: Number(value), text: "" });
                resetViewSelection();
              }}
              className="h-8 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">{t("result.filterColumn")}</option>
              {filterableColumns.map(({ column, index }) => (
                <option key={index} value={index}>
                  {column.name}
                  {columns.some((other, otherIndex) => otherIndex !== index && other.name === column.name)
                    ? ` (${index + 1})`
                    : ""}
                </option>
              ))}
            </select>
            <Input
              aria-label={t("result.filterContains")}
              placeholder={t("result.filterContains")}
              disabled={filter === null}
              value={filter?.text ?? ""}
              onChange={(event) => {
                if (!filter) return;
                setFilter({ ...filter, text: event.target.value });
                resetViewSelection();
              }}
              className="w-44 max-w-full"
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSort(null);
                setFilter(null);
                resetViewSelection();
              }}
            >
              {t("result.resetPageView")}
            </Button>
            {filter?.text ? (
              <span role="status" className="text-xs text-muted-foreground">
                {t("result.pageMatchCount", { visible: rows.length, delivered: deliveredRows.length })}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t("result.pageViewHelp")}</p>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-border">
        <span id={gridDescriptionId} className="sr-only">
          {t("result.gridSelectionHelp")}{pageViewEnabled ? ` ${t("result.sortKeyboardHelp")}` : ""}
        </span>
        <table
          role="grid"
          className="table-fixed border-collapse text-sm"
          style={{ width: columnWidths.reduce((sum, width) => sum + width, 0) }}
          aria-multiselectable="true"
          aria-describedby={gridDescriptionId}
          onKeyDown={handleGridKeyDown}
        >
          <colgroup>
            {columnWidths.map((width, index) => (
              <col key={index} style={{ width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {columns.map((column, colIndex) => {
                const isActive =
                  (rowCount === 0 && colIndex === Math.max(0, activeCell.col)) ||
                  (activeCell?.row === -1 && activeCell.col === colIndex);
                const isSelected = selectedHeader?.colIndex === colIndex;
                const sortable = pageViewEnabled && isColumnCopyable(column);
                const direction = sort?.column === colIndex ? sort.direction : undefined;
                const SortIcon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowDownUp;
                const sortLabel = direction === "ascending"
                  ? t("result.sortDescending", { name: column.name })
                  : direction === "descending"
                    ? t("result.sortOriginal", { name: column.name })
                    : t("result.sortAscending", { name: column.name });
                return (
                  <th
                    key={colIndex}
                    ref={(el) => setCellRef(-1, colIndex, el)}
                    scope="col"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => handleHeaderClick(colIndex)}
                    onFocus={() => setActiveCell({ row: -1, col: colIndex })}
                    data-selected={isSelected ? "" : undefined}
                    aria-selected={isSelected}
                    aria-label={column.name}
                    aria-sort={direction}
                    aria-keyshortcuts={sortable ? "Shift+ArrowLeft Shift+ArrowRight Shift+Enter" : "Shift+ArrowLeft Shift+ArrowRight"}
                    aria-description={t("result.columnWidth", { width: columnWidths[colIndex]! })}
                    className={cn(
                      "relative cursor-default select-none px-3 py-2 pr-5 font-medium focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                      isSelected && "ring-2 ring-inset ring-ring",
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-1">
                      <span className="truncate">{column.name}</span>
                      {sortable && (
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-label={sortLabel}
                          title={sortLabel}
                          className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", direction && "bg-primary/10 text-primary")}
                          onClick={(event) => { event.stopPropagation(); cycleSort(colIndex); }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <SortIcon className="size-3.5" aria-hidden />
                        </button>
                      )}
                    </div>
                    <span
                      aria-hidden="true"
                      title={t("result.resizeColumn", { name: column.name })}
                      data-testid="result-column-resize"
                      className="absolute inset-y-0 right-0 w-3 cursor-col-resize touch-none border-r border-border hover:border-primary hover:bg-primary/15"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => {
                        if (event.button !== 0 || !event.isPrimary) return;
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        resizeDrag.current = { pointerId: event.pointerId, column: colIndex, startX: event.clientX, width: columnWidths[colIndex]! };
                      }}
                      onPointerMove={(event) => {
                        const drag = resizeDrag.current;
                        if (drag?.pointerId === event.pointerId && drag.column === colIndex) {
                          adjustColumnWidth(colIndex, event.clientX - drag.startX, drag.width);
                        }
                      }}
                      onLostPointerCapture={(event) => {
                        if (resizeDrag.current?.pointerId === event.pointerId) resizeDrag.current = null;
                      }}
                    />
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
                  const isSelected = !!range &&
                    rowIndex >= range.top && rowIndex <= range.bottom &&
                    cellIndex >= range.left && cellIndex <= range.right;
                  return (
                    <td
                      key={cellIndex}
                      ref={(el) => setCellRef(rowIndex, cellIndex, el)}
                      tabIndex={isActive ? 0 : -1}
                      onMouseDown={(event) => { if (event.shiftKey) event.preventDefault(); }}
                      onClick={(event) => handleCellClick(rowIndex, cellIndex, event.shiftKey)}
                      onFocus={() => setActiveCell({ row: rowIndex, col: cellIndex })}
                      data-selected={isSelected ? "" : undefined}
                      aria-selected={isSelected}
                      className={cn(
                        "cursor-default px-3 py-2 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring",
                        isSelected && (isMultiCell
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/40"
                          : "ring-2 ring-inset ring-ring"),
                      )}
                    >
                      <ResultCell value={cell} truncated={isCellTruncated(rowIndex, cellIndex)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowCount === 0 ? (
        <p className="text-sm text-muted-foreground">{t("result.pageNoMatches")}</p>
      ) : null}
    </div>
  );
}

/**
 * Render one JSON-safe cell. SQL NULL is preserved as an explicit, localized
 * marker — never coerced to 0, empty string, or "undefined". A truncated cell
 * keeps the backend's safe prefix value unchanged and gains a separate
 * accessible badge; the flag never becomes part of the rendered value.
 */
function ResultCell({ value, truncated }: { value: QueryResultCellValue; truncated?: boolean }) {
  const t = useTranslations("queryWorkbench");

  const rendered =
    value === null ? (
      <span className="min-w-0 truncate font-mono text-xs italic text-muted-foreground">{t("result.nullMarker")}</span>
    ) : typeof value === "boolean" ? (
      <span className="min-w-0 truncate font-mono text-xs text-foreground">{value ? "true" : "false"}</span>
    ) : (
      <span className="min-w-0 truncate font-mono text-xs text-foreground">{String(value)}</span>
    );

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {rendered}
      {truncated ? (
        <Badge
          variant="outline"
          className="shrink-0 border-amber-500/50 px-1 py-0 text-[10px] font-medium text-amber-700 dark:text-amber-300"
          title={t("result.cellTruncated")}
          aria-label={t("result.cellTruncated")}
          data-testid="cell-truncated-badge"
        >
          {t("result.cellTruncated")}
        </Badge>
      ) : null}
    </span>
  );
}

const QUERY_EXECUTE_ERROR_COPY_CODES = new Set([
  "validation_failed",
  "query_not_allowed",
  "query_target_not_found",
  "query_explain_not_supported",
  "query_index_required",
  "query_result_disclosure_blocked",
  "query_binding_mismatch",
  "query_dependency_not_approved",
  "result_contract_upgrade_required",
  "query_timeout",
  "query_backend_error",
  "query_rate_limited",
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
  "schema_validation_failed",
  "query_connection_not_found",
  "query_connection_disabled",
  "dsn_binding_mismatch",
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
  engine,
}: {
  error: QueryExecuteError;
  onRetry: () => void;
  engine?: "redis" | "mongo";
}) {
  const t = useTranslations("queryWorkbench");
  const copyCode = executeErrorCopyCode(error.code);
  const showRetry = isRetryableControlledErrorCode(error.code);
  const validationCopy =
    engine === "redis" ? "editor.redisValidationFailed" : engine === "mongo" ? "editor.mongoValidationFailed" : null;

  return (
    <div
      role="alert"
      className="space-y-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-3"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        {validationCopy !== null && copyCode === "validation_failed" ? t(validationCopy) : t(`error.${copyCode}`)}
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
