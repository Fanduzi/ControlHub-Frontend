"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Check, ChevronDown, Copy, ListTree, Lock, Play, SearchCode, TriangleAlert } from "lucide-react";
import type { EditorView } from "@codemirror/view";

import type { QueryTarget } from "@/types/query-target";
import type {
  ExplainResponse,
  QueryExecuteResponse,
  QueryExecutionFilter,
  QueryExecutionRecord,
  QueryResultCellValue,
  QueryExecutionStatus,
  RelatedRecordNavigationResponse,
  TablePreviewRequest,
} from "@/types/query-execution";
import {
  executeQueryTarget,
  explainQueryTarget,
  listQueryExecutions,
  navigateRelatedRecords,
  QueryExecuteError,
  type QueryExecuteErrorCode,
} from "@/services/query-executions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import type { ForeignKeyDetail } from "@/types/query-schema";
import { useWorksheetSchemaAdapter } from "@/lib/use-worksheet-schema-adapter";
import { copyToClipboard } from "@/lib/clipboard";

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

type WorksheetTab = "worksheet" | "history";

const WORKSHEET_TABS: { id: WorksheetTab; labelKey: string }[] = [
  { id: "worksheet", labelKey: "editor.worksheetTab" },
  { id: "history", labelKey: "editor.historyTab" },
];

const DEFAULT_STATEMENT = "select 1";
const DEFAULT_MAX_ROWS = 100;
const HISTORY_STATUS_OPTIONS: readonly QueryExecutionStatus[] = [
  "success",
  "rejected",
  "failed",
  "timeout",
];

/** Fixed id for the SSR/client initial worksheet — must not use Date.now()/random. */
const INITIAL_WORKSHEET_ID = "worksheet-1";

/**
 * Convert a YYYY-MM-DD date string (from `<input type="date">`) to RFC3339
 * start-of-day UTC for the `from` query parameter.
 */
function toRFC3339From(dateStr: string): string {
  return `${dateStr}T00:00:00Z`;
}

/**
 * Convert a YYYY-MM-DD date string to RFC3339 start-of-next-day UTC (exclusive
 * upper bound) for the `to` query parameter.
 */
function toRFC3339To(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * History state machine for a single worksheet. Independent of the execution
 * requestId — history has its own generation counter for stale rejection.
 */
type HistoryState = {
  replaceStatus: "idle" | "loading" | "ready" | "error";
  items: QueryExecutionRecord[];
  replaceError?: string;
  appendStatus: "idle" | "loading" | "error";
  appendError?: string;
  nextCursor: string | null;
  filters: QueryExecutionFilter;
  pendingFilters: QueryExecutionFilter;
  selectedRecordId: number | null;
  /** The targetId this history was fetched for. */
  boundTargetId: number;
  /** Monotonic generation counter for stale rejection. */
  generation: number;
};

function createHistoryState(targetId: number): HistoryState {
  return {
    replaceStatus: "idle",
    items: [],
    appendStatus: "idle",
    nextCursor: null,
    filters: {},
    pendingFilters: {},
    selectedRecordId: null,
    boundTargetId: targetId,
    generation: 0,
  };
}

type PreviewProvenance = {
  readonly targetId: number;
  readonly database: string;
  readonly table: string;
  readonly kind: "table";
  readonly statement: string;
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
};

type NavigationCapability = {
  readonly sourceDatabase: string;
  readonly sourceObject: string;
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
  readonly onNavigate: (foreignKey: string, localValues: readonly string[]) => void;
};

type RelatedRecordsState =
  | { readonly status: "idle"; readonly generation: number }
  | { readonly status: "loading"; readonly generation: number; readonly foreignKey: string }
  | { readonly status: "ready"; readonly generation: number; readonly response: RelatedRecordNavigationResponse }
  | { readonly status: "error"; readonly generation: number; readonly code: QueryExecuteErrorCode };

/**
 * Worksheet-local Explain state. Independent from Run results/history.
 * A response applies only when worksheet id, generation, target id, and
 * statement identity still match (stale-response guard).
 */
type ExplainState = {
  status: "idle" | "loading" | "ready" | "error";
  requestGeneration: number;
  statementIdentity: string | null;
  targetId: number | null;
  response: ExplainResponse | null;
  errorCode: QueryExecuteErrorCode | null;
};

function createExplainState(): ExplainState {
  return {
    status: "idle",
    requestGeneration: 0,
    statementIdentity: null,
    targetId: null,
    response: null,
    errorCode: null,
  };
}

function invalidateExplainState(explain: ExplainState): ExplainState {
  return {
    status: "idle",
    requestGeneration: explain.requestGeneration + 1,
    statementIdentity: null,
    targetId: null,
    response: null,
    errorCode: null,
  };
}

type LocalWorksheet = {
  id: string;
  name: string;
  targetResourceId: number;
  statement: string;
  maxRows: number;
  isExecuting: boolean;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
  formatError: string | null;
  history: HistoryState;
  requestId: string;
  activeDatabase: string | null;
  isDirty: boolean;
  previewProvenance: PreviewProvenance | null;
  relatedRecords: RelatedRecordsState;
  explain: ExplainState;
};

function createInitialWorksheet(targetResourceId: number): LocalWorksheet {
  return {
    id: INITIAL_WORKSHEET_ID,
    name: "Worksheet 1",
    targetResourceId,
    statement: DEFAULT_STATEMENT,
    maxRows: DEFAULT_MAX_ROWS,
    isExecuting: false,
    result: null,
    error: null,
    formatError: null,
    history: createHistoryState(targetResourceId),
    requestId: "req-initial",
    activeDatabase: null,
    isDirty: false,
    previewProvenance: null,
    relatedRecords: { status: "idle", generation: 0 },
    explain: createExplainState(),
  };
}

/** Client-only worksheet factory (after hydration). Unique ids are fine here. */
function createWorksheet(index: number, targetResourceId: number): LocalWorksheet {
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${index}`;
  return {
    id: `worksheet-${index}-${unique}`,
    name: `Worksheet ${index}`,
    targetResourceId,
    statement: DEFAULT_STATEMENT,
    maxRows: DEFAULT_MAX_ROWS,
    isExecuting: false,
    result: null,
    error: null,
    formatError: null,
    history: createHistoryState(targetResourceId),
    requestId: `req-${unique}`,
    activeDatabase: null,
    isDirty: false,
    previewProvenance: null,
    relatedRecords: { status: "idle", generation: 0 },
    explain: createExplainState(),
  };
}

export function QueryEditorShell({ targets, activeTarget, targetSelectionVersion, onActiveTargetChange, onActiveDatabaseChange, schemaStore, pendingPreviewEvent, onPreviewConsumed }: QueryEditorShellProps) {
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
    createInitialWorksheet(activeTarget.resourceId),
  ]);
  const [activeWorksheetId, setActiveWorksheetId] = useState(INITIAL_WORKSHEET_ID);
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
              history: createHistoryState(newTargetId),
              isExecuting: false,
              requestId: crypto.randomUUID(),
              isDirty: false,
              previewProvenance: null,
              relatedRecords: { status: "idle", generation: ws.relatedRecords.generation + 1 },
              explain: invalidateExplainState(ws.explain),
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

  const refreshHistory = useCallback(async (worksheetId?: string, requestedFilters?: QueryExecutionFilter) => {
    const targetWorksheetId = worksheetId ?? activeWorksheetId;
    const worksheet = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
    if (!worksheet) return;

    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;

    const targetId = worksheet.targetResourceId;
    const nextGeneration = worksheet.history.generation + 1;
    const filters = requestedFilters ?? worksheet.history.filters;

    setWorksheets((previous) =>
      previous.map((ws) =>
        ws.id === targetWorksheetId
          ? {
              ...ws,
              history: {
                ...ws.history,
                replaceStatus: "loading" as const,
                replaceError: undefined,
                appendStatus: "idle" as const,
                appendError: undefined,
                items: [],
                nextCursor: null,
                filters,
                pendingFilters: requestedFilters === undefined ? ws.history.pendingFilters : filters,
                selectedRecordId: null,
                boundTargetId: targetId,
                generation: nextGeneration,
              },
            }
          : ws,
      ),
    );

    try {
      const response = await listQueryExecutions(targetId, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { from: toRFC3339From(filters.from) } : {}),
        ...(filters.to ? { to: toRFC3339To(filters.to) } : {}),
        pageSize: 20,
      });
      setWorksheets((previous) => {
        const current = previous.find((ws) => ws.id === targetWorksheetId);
        if (
          !current ||
          current.targetResourceId !== targetId ||
          current.history.generation !== nextGeneration ||
          current.history.filters.status !== filters.status ||
          current.history.filters.from !== filters.from ||
          current.history.filters.to !== filters.to
        ) return previous;
        const seenIds = new Set<number>();
        const items = response.items.filter((item) => {
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        });
        return previous.map((ws) =>
          ws.id === targetWorksheetId
            ? {
                ...ws,
                history: {
                  ...ws.history,
                  replaceStatus: "ready" as const,
                  replaceError: undefined,
                  items,
                  nextCursor: response.nextCursor,
                  filters,
                  appendStatus: "idle" as const,
                  appendError: undefined,
                  boundTargetId: targetId,
                  generation: nextGeneration,
                },
              }
            : ws,
        );
      });
    } catch {
      setWorksheets((previous) => {
        const current = previous.find((ws) => ws.id === targetWorksheetId);
        if (
          !current ||
          current.targetResourceId !== targetId ||
          current.history.generation !== nextGeneration ||
          current.history.filters.status !== filters.status ||
          current.history.filters.from !== filters.from ||
          current.history.filters.to !== filters.to
        ) return previous;
        return previous.map((ws) =>
          ws.id === targetWorksheetId
            ? {
                ...ws,
                history: {
                  ...ws.history,
                  replaceStatus: "error" as const,
                  replaceError: "historyLoadFailed",
                  appendStatus: "idle" as const,
                  appendError: undefined,
                  generation: nextGeneration,
                },
              }
            : ws,
        );
      });
    }
  }, [activeWorksheetId]);

  const loadMoreHistory = useCallback(async (worksheetId?: string) => {
    const targetWorksheetId = worksheetId ?? activeWorksheetId;
    const worksheet = worksheetsRef.current.find((ws) => ws.id === targetWorksheetId);
    if (!worksheet) return;

    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;

    const targetId = worksheet.targetResourceId;
    const { nextCursor, filters, generation } = worksheet.history;
    if (!nextCursor || worksheet.history.appendStatus === "loading") return;

    setWorksheets((previous) =>
      previous.map((ws) =>
        ws.id === targetWorksheetId
          ? {
              ...ws,
              history: {
                ...ws.history,
                appendStatus: "loading" as const,
                appendError: undefined,
              },
            }
          : ws,
      ),
    );

    try {
      const response = await listQueryExecutions(targetId, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { from: toRFC3339From(filters.from) } : {}),
        ...(filters.to ? { to: toRFC3339To(filters.to) } : {}),
        cursor: nextCursor,
        pageSize: 20,
      });
      setWorksheets((previous) => {
        const current = previous.find((ws) => ws.id === targetWorksheetId);
        if (
          !current ||
          current.targetResourceId !== targetId ||
          current.history.boundTargetId !== targetId ||
          current.history.generation !== generation ||
          current.history.filters.status !== filters.status ||
          current.history.filters.from !== filters.from ||
          current.history.filters.to !== filters.to
        ) {
          return previous;
        }
        const seenIds = new Set(current.history.items.map((item) => item.id));
        const newItems = response.items.filter((item) => {
          if (seenIds.has(item.id)) return false;
          seenIds.add(item.id);
          return true;
        });
        return previous.map((ws) =>
          ws.id === targetWorksheetId
            ? {
                ...ws,
                history: {
                  ...ws.history,
                  items: [...ws.history.items, ...newItems],
                  nextCursor: response.nextCursor,
                  appendStatus: "idle" as const,
                  appendError: undefined,
                },
              }
            : ws,
        );
      });
    } catch {
      setWorksheets((previous) => {
        const current = previous.find((ws) => ws.id === targetWorksheetId);
        if (
          !current ||
          current.targetResourceId !== targetId ||
          current.history.boundTargetId !== targetId ||
          current.history.generation !== generation ||
          current.history.filters.status !== filters.status ||
          current.history.filters.from !== filters.from ||
          current.history.filters.to !== filters.to
        ) {
          return previous;
        }
        return previous.map((ws) =>
          ws.id === targetWorksheetId
            ? {
                ...ws,
                history: {
                  ...ws.history,
                  appendStatus: "error" as const,
                  appendError: "historyAppendFailed",
                },
              }
            : ws,
        );
      });
    }
  }, [activeWorksheetId]);

  function applyFilters(filters: QueryExecutionFilter) {
    updateActiveWorksheet({
      history: { ...activeWorksheet.history, pendingFilters: filters },
    });
    void refreshHistory(activeWorksheetId, filters);
  }

  function clearFilters() {
    const filters: QueryExecutionFilter = {};
    updateActiveWorksheet({
      history: { ...activeWorksheet.history, pendingFilters: filters },
    });
    void refreshHistory(activeWorksheetId, filters);
  }

  function openHistoryDetail(record: QueryExecutionRecord) {
    updateActiveWorksheet({
      history: { ...activeWorksheet.history, selectedRecordId: record.id },
    });
  }

  function closeHistoryDetail() {
    updateActiveWorksheet({
      history: { ...activeWorksheet.history, selectedRecordId: null },
    });
  }

  function selectWorksheetTab(tab: WorksheetTab) {
    setActiveTab(tab);
    if (tab !== "history") return;
    const worksheet = worksheetsRef.current.find((ws) => ws.id === activeWorksheetId);
    if (!worksheet) return;
    const target = targetsByIdRef.current.get(worksheet.targetResourceId);
    if (!target?.availableActions.run) return;
    if (worksheet.history.replaceStatus === "idle" || worksheet.history.replaceStatus === "error") {
      void refreshHistory(worksheet.id);
    }
  }

  // Seed with the prop so initial mount (version 0) is not treated as a user
  // target switch. Only navigator-driven version bumps create a new worksheet.
  const lastSeenVersionRef = useRef(targetSelectionVersion);

  useEffect(() => {
    if (targetSelectionVersion === lastSeenVersionRef.current) {
      return;
    }
    lastSeenVersionRef.current = targetSelectionVersion;

    // Create a new worksheet for the new target instead of retargeting the active one
    // This preserves the original worksheet's SQL, result, and history.
    // Invalidate Explain on the previously active worksheet so a pending
    // response cannot reappear when the operator returns to it.
    const previousActiveId = activeWorksheetId;
    const newWs = createWorksheet(worksheetsRef.current.length + 1, activeTarget.resourceId);
    const newWorksheets = worksheetsRef.current.map((ws) =>
      ws.id === previousActiveId
        ? { ...ws, explain: invalidateExplainState(ws.explain) }
        : ws,
    );
    newWorksheets.push(newWs);
    worksheetsRef.current = newWorksheets;
    setWorksheets(newWorksheets);
    setActiveWorksheetId(newWs.id);

    // Do not fetch history on target-switch worksheet creation. History loads
    // on first History-tab open (or after a successful run for that worksheet).
  }, [targetSelectionVersion, activeTarget.resourceId, activeTarget.availableActions.run, activeWorksheetId]);

  // Consume preview events from Object Explorer. Creates a new worksheet with
  // a generated qualified statement and stores provenance. Never auto-executes.
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

    const quotedDb = `\`${request.database.replace(/`/g, "``")}\``;
    const quotedTable = `\`${request.table.replace(/`/g, "``")}\``;
    const statement = `SELECT * FROM ${quotedDb}.${quotedTable} LIMIT ${DEFAULT_MAX_ROWS}`;

    const newWs: LocalWorksheet = {
      ...createWorksheet(worksheetsRef.current.length + 1, request.targetId),
      name: `Preview: ${request.table}`,
      targetResourceId: request.targetId,
      statement,
      previewProvenance: {
        targetId: request.targetId,
        database: request.database,
        table: request.table,
        kind: "table",
        statement,
        foreignKeys: request.foreignKeys,
        foreignKeysTruncated: request.foreignKeysTruncated,
      },
    };
    const newWorksheets = [...worksheetsRef.current, newWs];
    worksheetsRef.current = newWorksheets;
    setWorksheets(newWorksheets);
    setActiveWorksheetId(newWs.id);
  }, [pendingPreviewEvent, onPreviewConsumed, activeTarget.resourceId]);

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

  const activeProvenanceRef = useRef(activeWorksheet.previewProvenance);
  activeProvenanceRef.current = activeWorksheet.previewProvenance;

  function handleRelatedRecordsNavigate(foreignKey: string, localValues: readonly string[]) {
    const provenance = activeProvenanceRef.current;
    if (!provenance) return;

    const targetId = activeWorksheet.targetResourceId;
    const worksheetId = activeWorksheet.id;
    const generation = activeWorksheet.relatedRecords.generation + 1;

    updateActiveWorksheet({
      relatedRecords: { status: "loading", generation, foreignKey },
    });

    void navigateRelatedRecords(targetId, {
      source: {
        database: provenance.database,
        object: provenance.table,
        kind: "table",
        foreignKey,
      },
      localValues: [...localValues],
    }).then(
      (response) => {
        setWorksheets((previous) => {
          const ws = previous.find((w) => w.id === worksheetId);
          if (
            !ws ||
            ws.targetResourceId !== targetId ||
            ws.relatedRecords.generation !== generation ||
            ws.previewProvenance?.statement !== provenance.statement
          ) {
            return previous;
          }
          return previous.map((w) =>
            w.id === worksheetId
              ? { ...w, relatedRecords: { status: "ready" as const, generation, response } }
              : w,
          );
        });
      },
      (error: unknown) => {
        setWorksheets((previous) => {
          const ws = previous.find((w) => w.id === worksheetId);
          if (
            !ws ||
            ws.targetResourceId !== targetId ||
            ws.relatedRecords.generation !== generation
          ) {
            return previous;
          }
          const code = error instanceof QueryExecuteError
            ? error.code
            : "internal_error" as const;
          return previous.map((w) =>
            w.id === worksheetId
              ? { ...w, relatedRecords: { status: "error" as const, generation, code } }
              : w,
          );
        });
      },
    );
  }

  function handleCloseRelatedRecords() {
    updateActiveWorksheet({
      relatedRecords: { status: "idle", generation: activeWorksheet.relatedRecords.generation + 1 },
    });
  }

  async function handleRun() {
    if (!runEnabled) {
      return;
    }

    const worksheetId = activeWorksheetId;
    const targetId = activeWorksheet.targetResourceId;
    const requestId = crypto.randomUUID();
    const provenance = activeWorksheet.previewProvenance;
    const statementChanged = provenance !== null && activeWorksheet.statement !== provenance.statement;

    updateActiveWorksheet({
      isExecuting: true,
      error: null,
      requestId,
      isDirty: false,
      relatedRecords: {
        status: "idle",
        generation: activeWorksheet.relatedRecords.generation + 1,
      },
      explain: invalidateExplainState(activeWorksheet.explain),
      ...(statementChanged ? { previewProvenance: null } : {}),
    });

    try {
      const response = await executeQueryTarget(targetId, {
        statement: activeWorksheet.statement,
        maxRows: activeWorksheet.maxRows,
      });

      guardedUpdateWorksheet(worksheetId, requestId, { result: response });
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

  async function handleExplain() {
    const canExplain = actions.explain === true;
    const statement = activeWorksheet.statement.trim();
    if (!canExplain || statement === "" || activeWorksheet.isExecuting || activeWorksheet.explain.status === "loading") {
      return;
    }

    const worksheetId = activeWorksheetId;
    const targetId = activeWorksheet.targetResourceId;
    const statementIdentity = statement;
    const requestGeneration = activeWorksheet.explain.requestGeneration + 1;
    // Invalidate any in-flight Run by bumping requestId synchronously.
    const requestId = crypto.randomUUID();

    updateActiveWorksheet({
      requestId,
      isExecuting: false,
      explain: {
        status: "loading",
        requestGeneration,
        statementIdentity,
        targetId,
        response: null,
        errorCode: null,
      },
    });

    try {
      const response = await explainQueryTarget(targetId, { statement });
      setWorksheets((previous) => {
        const ws = previous.find((w) => w.id === worksheetId);
        if (
          !ws ||
          ws.explain.requestGeneration !== requestGeneration ||
          ws.targetResourceId !== targetId ||
          ws.explain.statementIdentity !== statementIdentity
        ) {
          return previous;
        }
        return previous.map((w) =>
          w.id === worksheetId
            ? {
                ...w,
                explain: {
                  status: "ready" as const,
                  requestGeneration,
                  statementIdentity,
                  targetId,
                  response,
                  errorCode: null,
                },
              }
            : w,
        );
      });
    } catch (caught) {
      const code =
        caught instanceof QueryExecuteError ? caught.code : ("internal_error" as const);
      setWorksheets((previous) => {
        const ws = previous.find((w) => w.id === worksheetId);
        if (
          !ws ||
          ws.explain.requestGeneration !== requestGeneration ||
          ws.targetResourceId !== targetId ||
          ws.explain.statementIdentity !== statementIdentity
        ) {
          return previous;
        }
        return previous.map((w) =>
          w.id === worksheetId
            ? {
                ...w,
                explain: {
                  status: "error" as const,
                  requestGeneration,
                  statementIdentity,
                  targetId,
                  response: null,
                  errorCode: code,
                },
              }
            : w,
        );
      });
    }
  }

  function handleCloseExplain() {
    updateActiveWorksheet({
      explain: invalidateExplainState(activeWorksheet.explain),
    });
  }

  function handleFormat() {
    const worksheet = activeWorksheet;
    const target = targetsById.get(worksheet.targetResourceId);
    const result = formatQueryStatement(
      target?.connectionContext.engine ?? "sql",
      worksheet.statement,
    );

    if (result.ok) {
      const statementChanged = result.formatted !== worksheet.statement;
      updateActiveWorksheet({
        statement: result.formatted,
        formatError: null,
        isDirty: true,
        ...(statementChanged
          ? {
              previewProvenance: null,
              relatedRecords: {
                status: "idle" as const,
                generation: worksheet.relatedRecords.generation + 1,
              },
              explain: invalidateExplainState(worksheet.explain),
            }
          : {}),
      });
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
              onStatementChange={(value) => {
                updateActiveWorksheet({
                  statement: value,
                  isDirty: true,
                  previewProvenance: null,
                  relatedRecords: { status: "idle", generation: activeWorksheet.relatedRecords.generation + 1 },
                  explain: invalidateExplainState(activeWorksheet.explain),
                });
              }}
              maxRows={activeWorksheet.maxRows}
              onMaxRowsChange={(value) => updateActiveWorksheet({ maxRows: value })}
              runEnabled={runEnabled}
              isExecuting={activeWorksheet.isExecuting}
              onRun={handleRun}
              explainEnabled={
                actions.explain === true &&
                activeWorksheet.statement.trim() !== ""
              }
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
              loadedDatabases={loadedDatabases}
              loadedObjects={loadedObjects}
              previewProvenance={activeWorksheet.previewProvenance}
              relatedRecords={activeWorksheet.relatedRecords}
              onRelatedRecordsNavigate={handleRelatedRecordsNavigate}
              onCloseRelatedRecords={handleCloseRelatedRecords}
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
  loadedDatabases,
  loadedObjects,
  previewProvenance,
  relatedRecords,
  onRelatedRecordsNavigate,
  onCloseRelatedRecords,
}: {
  worksheetId: string;
  statement: string;
  onStatementChange: (value: string) => void;
  maxRows: number;
  onMaxRowsChange: (value: number) => void;
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
  loadedDatabases: readonly string[];
  loadedObjects: readonly ObjectSummary[];
  previewProvenance: PreviewProvenance | null;
  relatedRecords: RelatedRecordsState;
  onRelatedRecordsNavigate: (foreignKey: string, localValues: readonly string[]) => void;
  onCloseRelatedRecords: () => void;
}) {
  const t = useTranslations("queryWorkbench");
  const { namespace, columnFetcher } = useWorksheetSchemaAdapter(
    schemaStore,
    targetId,
    activeDatabase ?? undefined,
    loadedDatabases,
    loadedObjects,
  );

  // Ref for the Related records trigger button, used for focus restoration
  // when the RelatedRecordsPanel closes. Avoids global querySelector.
  const relatedRecordsTriggerRef = useRef<HTMLButtonElement>(null);
  const explainTriggerRef = useRef<HTMLButtonElement>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const explainLoading = explainState.status === "loading";
  const explainButtonDisabled = !explainEnabled || isExecuting || explainLoading;

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button ref={runButtonRef} type="button" size="sm" disabled={!runEnabled} onClick={onRun}>
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
            value={maxRows}
            onChange={(event) => onMaxRowsChange(Number(event.target.value))}
            aria-label={t("editor.maxRowsLabel")}
            className="h-8 w-20"
          />
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
        <SqlCodeEditor
          key={worksheetId}
          value={statement}
          onChange={onStatementChange}
          engine={engine}
          onRun={onRun}
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

      <div className="p-3">
        {error ? (
          <ExecuteErrorPanel error={error} />
        ) : result ? (
          <>
            <ExecuteResult
              result={result}
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

/**
 * Normalize a QueryExecuteResponse for safe rendering.
 *
 * The backend may send `rows: null` for zero-row results (legacy mixed-version
 * behavior). This normalizes that specific proven shape to an empty array so
 * ResultTable never receives null rows.
 *
 * For malformed responses (non-array rows/columns, inconsistent rowCount),
 * returns a controlled error message instead of allowing a TypeError crash.
 */
function normalizeExecuteResponse(
  raw: QueryExecuteResponse,
): { ok: true; response: QueryExecuteResponse } | { ok: false; error: string } {
  if (!Array.isArray(raw.columns)) {
    return { ok: false, error: "Invalid response: columns is not an array" };
  }
  for (const col of raw.columns) {
    if (typeof col?.name !== "string" || col.name.length === 0) {
      return { ok: false, error: "Invalid response: column missing name" };
    }
  }

  if (raw.rows === null || raw.rows === undefined) {
    if (raw.status === "success" && raw.rowCount === 0) {
      return { ok: true, response: { ...raw, rows: [] } };
    }
    return { ok: false, error: "Invalid response: rows is null with non-zero rowCount" };
  }

  if (!Array.isArray(raw.rows)) {
    return { ok: false, error: "Invalid response: rows is not an array" };
  }

  if (raw.rows.length !== raw.rowCount) {
    return { ok: false, error: "Invalid response: row count mismatch" };
  }

  return { ok: true, response: raw };
}

function ExecuteResult({ result, navigationCapability, relatedRecordsTriggerRef, onRelatedRecordsIneligible }: { result: QueryExecuteResponse; navigationCapability?: NavigationCapability; relatedRecordsTriggerRef?: React.RefObject<HTMLButtonElement | null>; onRelatedRecordsIneligible?: () => void }) {
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

      <ResultTable key={safeResult.executionId} columns={safeResult.columns} rows={safeResult.rows} navigationCapability={navigationCapability} relatedRecordsTriggerRef={relatedRecordsTriggerRef} onRelatedRecordsIneligible={onRelatedRecordsIneligible} />
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
            <ResultTable columns={safeResponse.columns} rows={safeResponse.rows} />
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
            {t(`explain.error.${state.errorCode ?? "internal_error"}`)}
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {t("explain.retry")}
          </Button>
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
}: {
  columns: QueryExecuteResponse["columns"];
  rows: QueryExecuteResponse["rows"];
  navigationCapability?: NavigationCapability;
  relatedRecordsTriggerRef?: React.RefObject<HTMLButtonElement | null>;
  onRelatedRecordsIneligible?: () => void;
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
        if (!columns[colIndex]!.copyAllowed) {
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

  async function handleCopy() {
    let text: string;
    if (selectedCell) {
      const column = columns[selectedCell.colIndex];
      if (column && !column.copyAllowed) {
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
      if (column && !column.copyAllowed) {
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
          disabled={!selectedCell && !selectedHeader || (selectedCell ? !columns[selectedCell.colIndex]?.copyAllowed : false)}
          onClick={() => void handleCopy()}
          aria-label={copyButtonLabel()}
          data-testid="copy-selection"
        >
          <Copy className="size-3.5" aria-hidden />
          {t("result.copyCellValue")}
        </Button>
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
