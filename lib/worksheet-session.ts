// input: query execution ports, saved-statement execute port, worksheet snapshot types, query-workspace persist types
// output: WorksheetSession (edit/replace/run/template commands + persisted snapshot for the query workbench 工作表)
// pos: in-process worksheet session; React only renders
// note: if this file changes, update header and lib/README.md
import { useSyncExternalStore } from "react";

import {
  executeQueryTarget,
  explainQueryTarget,
  isAbortError,
  listQueryExecutions,
  navigateRelatedRecords,
  QueryExecuteError,
} from "@/services/query-executions";
import { executeSavedStatementTemplate } from "@/services/query-saved-statements";
import {
  DEFAULT_QUERY_MAX_ROWS,
  QUERY_RESULT_PAGE_SIZES,
} from "@/lib/query-editor-preferences";
import type {
  ExplainResponse,
  QueryExecutePaginationResponse,
  QueryExecuteResponse,
  QueryExecutionCursorPage,
  QueryExecutionFilter,
  QueryExecutionRecord,
  QueryExecutionRemoteState,
  QueryExecutionStatus,
  RelatedRecordNavigationRequest,
  RelatedRecordNavigationResponse,
} from "@/types/query-execution";
import { queryExecutionRecordKey as recordKey } from "@/types/query-execution";
import type { ForeignKeyDetail } from "@/types/query-schema";
import type {
  QuerySavedStatementParameterDefinition,
  QuerySavedStatementParameterValue,
  QuerySavedStatementRecord,
} from "@/types/query-saved-statement";
import type { QueryWorkspaceWorksheet } from "@/types/query-workspace";

export const DEFAULT_STATEMENT = "select 1";
export const INITIAL_WORKSHEET_ID = "worksheet-1";
export const MAX_WORKSHEETS = 32;

export type HistoryState = {
  replaceStatus: "idle" | "loading" | "ready" | "error";
  items: QueryExecutionRecord[];
  replaceError?: string;
  appendStatus: "idle" | "loading" | "error";
  appendError?: string;
  nextCursor: string | null;
  filters: QueryExecutionFilter;
  pendingFilters: QueryExecutionFilter;
  selectedRecordId: number | null;
  boundTargetId: number;
  /** PostgreSQL connection scope; null keeps unscoped MySQL/TiDB history. */
  boundDatabase: string | null;
  generation: number;
};

/**
 * Post-cancel evidence about one keyed attempt, obtained by reading execution
 * history back with the attempt's `clientExecutionId`. `terminal` carries the
 * persisted status and remote-cancel evidence; `running` means a claim is
 * still occupied; `unknown` means no claim/record was observed inside the
 * bounded probe window. Never means "database stopped" by itself.
 */
export type CancellationOutcome =
  | {
      readonly kind: "terminal";
      readonly status: QueryExecutionStatus;
      readonly remoteState: QueryExecutionRemoteState | null;
    }
  | { readonly kind: "running" }
  | { readonly kind: "unknown" };

/**
 * Cancellation lifecycle of the in-flight keyed attempt. `idle` when nothing
 * was cancelled; `requested` from the user's cancel intent until the bounded
 * history probe resolves; `resolved` carries the observed outcome.
 */
export type CancellationState =
  | { readonly phase: "idle" }
  | {
      readonly phase: "requested";
      readonly key: string;
      readonly database: string | null;
    }
  | {
      readonly phase: "resolved";
      readonly key: string;
      readonly database: string | null;
      /**
       * Owning execute attempt identity; null for navigation attempts, whose
       * ownership is the unique key alone. An explicit refresh re-probes only
       * while this identity still owns the worksheet.
       */
      readonly requestId: string | null;
      readonly outcome: CancellationOutcome;
    };

export type PreviewProvenance = {
  readonly targetId: number;
  readonly database: string;
  /** PostgreSQL namespace of the previewed table; absent for MySQL/TiDB. */
  readonly schema?: string;
  readonly table: string;
  readonly kind: "table";
  readonly statement: string;
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
};

export type RelatedRecordsState =
  | { readonly status: "idle"; readonly generation: number }
  | { readonly status: "loading"; readonly generation: number; readonly foreignKey: string }
  | { readonly status: "ready"; readonly generation: number; readonly response: RelatedRecordNavigationResponse }
  | { readonly status: "error"; readonly generation: number; readonly code: string };

export type ExplainState = {
  status: "idle" | "loading" | "ready" | "error";
  requestGeneration: number;
  statementIdentity: string | null;
  targetId: number | null;
  response: ExplainResponse | null;
  errorCode: string | null;
};

export type Worksheet = {
  id: string;
  name: string;
  targetResourceId: number;
  statement: string;
  parameters: readonly QuerySavedStatementParameterDefinition[];
  parameterValues: Record<string, string>;
  templateStatementId: number | null;
  templateFieldErrors: Record<string, string>;
  maxRows: number;
  isExecuting: boolean;
  result: QueryExecuteResponse | null;
  error: QueryExecuteError | null;
  formatError: string | null;
  history: HistoryState;
  requestId: string;
  /**
   * Browse database for MySQL/TiDB; the selected composite connection
   * database for PostgreSQL (required before any PG execution).
   */
  activeDatabase: string | null;
  /** PostgreSQL namespace pin; null defers to the connection defaultSchema. */
  activeSchema: string | null;
  cancellation: CancellationState;
  isDirty: boolean;
  previewProvenance: PreviewProvenance | null;
  relatedRecords: RelatedRecordsState;
  explain: ExplainState;
  currentPage: number;
  pageSize: number;
  resultPagination: QueryExecutePaginationResponse | null;
};

export type WorksheetSessionPorts = {
  execute: typeof executeQueryTarget;
  executeTemplate: typeof executeSavedStatementTemplate;
  explain: typeof explainQueryTarget;
  navigateRelated: typeof navigateRelatedRecords;
  listExecutions: typeof listQueryExecutions;
};

const defaultPorts: WorksheetSessionPorts = {
  execute: executeQueryTarget,
  executeTemplate: executeSavedStatementTemplate,
  explain: explainQueryTarget,
  navigateRelated: navigateRelatedRecords,
  listExecutions: listQueryExecutions,
};

function createHistoryState(targetId: number, boundDatabase: string | null = null): HistoryState {
  return {
    replaceStatus: "idle",
    items: [],
    appendStatus: "idle",
    nextCursor: null,
    filters: {},
    pendingFilters: {},
    selectedRecordId: null,
    boundTargetId: targetId,
    boundDatabase,
    generation: 0,
  };
}

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

function createWorksheetRecord(
  id: string,
  name: string,
  targetResourceId: number,
  requestId: string,
  maxRows: number,
  pageSize: number,
): Worksheet {
  return {
    id,
    name,
    targetResourceId,
    statement: DEFAULT_STATEMENT,
    parameters: [],
    parameterValues: {},
    templateStatementId: null,
    templateFieldErrors: {},
    maxRows,
    isExecuting: false,
    result: null,
    error: null,
    formatError: null,
    history: createHistoryState(targetResourceId),
    requestId,
    activeDatabase: null,
    activeSchema: null,
    cancellation: { phase: "idle" },
    isDirty: false,
    previewProvenance: null,
    relatedRecords: { status: "idle", generation: 0 },
    explain: createExplainState(),
    currentPage: 1,
    pageSize,
    resultPagination: null,
  };
}

function toRFC3339From(dateStr: string): string {
  return `${dateStr}T00:00:00Z`;
}

function toRFC3339To(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildTemplateValues(
  worksheet: Worksheet,
): Readonly<Record<string, QuerySavedStatementParameterValue>> | null {
  const values: Record<string, QuerySavedStatementParameterValue> = {};
  for (const parameter of worksheet.parameters) {
    const raw = (worksheet.parameterValues[parameter.name] ?? "").trim();
    if (raw === "") return null;
    switch (parameter.type) {
      case "integer":
        values[parameter.name] = Number(raw);
        break;
      case "boolean":
        values[parameter.name] = raw === "true";
        break;
      case "string":
      case "decimal":
        values[parameter.name] = raw;
        break;
    }
  }
  return values;
}

/** Owned in-flight request: one intent, one controller, one pinned scope. */
type OwnedAttempt = {
  readonly worksheetId: string;
  /** clientExecutionId for keyed engines (PostgreSQL); null for keyless. */
  readonly key: string | null;
  readonly targetId: number;
  readonly database: string | null;
  readonly controller: AbortController;
};

/** In-flight keyed attempt control state — never persisted or rendered. */
type InflightAttempt = OwnedAttempt & {
  readonly requestId: string;
};

/** In-flight related-records navigation attempt — never persisted. */
type NavAttempt = OwnedAttempt & {
  readonly navId: string;
  /** Canonical intent identity: target + source scope + FK + ordered values. */
  readonly identity: string;
};

/**
 * In-flight keyed state probe owned by one attempt — registered under the
 * worksheet so context switches, close and dispose can reach its pending
 * read; never persisted or rendered.
 */
type ProbeAttempt = {
  readonly worksheetId: string;
  /** Owning execute requestId; null for navigation attempts (key-owned). */
  readonly requestId: string | null;
  readonly key: string;
  readonly controller: AbortController;
};

/**
 * Total wall-clock budget of one cancellation probe: backoff waits, the
 * in-flight GET and the finalization share this single deadline — a hanging
 * read consumes the window instead of holding a fresh per-poll budget.
 */
const PROBE_TOTAL_BUDGET_MS = 11_000;
const PROBE_BACKOFF_MS = [0, 400, 800, 1600, 3200, 5000] as const;

/** setTimeout that rejects when the owning signal aborts mid-wait. */
function sleepOrAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortError = () =>
      signal.reason instanceof Error
        ? signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export class WorksheetSession {
  private worksheets: Worksheet[];
  private activeWorksheetId: string;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private readonly ports: WorksheetSessionPorts;
  private readonly createId: () => string;
  private readonly engineFor: (targetId: number) => string | undefined;
  private readonly inflight = new Map<string, InflightAttempt>();
  private readonly navInflight = new Map<string, NavAttempt>();
  private readonly probes = new Map<string, ProbeAttempt>();
  private nextIndex: number;

  constructor(options: {
    readonly initialTargetId: number;
    readonly ports?: Partial<WorksheetSessionPorts>;
    readonly createId?: () => string;
    /**
     * Resolves a worksheet's target engine. Unknown/absent resolves to the
     * non-PostgreSQL path: no connection fields, no idempotency key.
     */
    readonly engineFor?: (targetId: number) => string | undefined;
    readonly initialMaxRows?: number;
    readonly initialPageSize?: number;
  }) {
    this.ports = { ...defaultPorts, ...options.ports };
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.engineFor = options.engineFor ?? (() => undefined);
    this.nextIndex = 1;
    this.activeWorksheetId = INITIAL_WORKSHEET_ID;
    this.worksheets = [
      createWorksheetRecord(
        INITIAL_WORKSHEET_ID,
        "Worksheet 1",
        options.initialTargetId,
        "req-initial",
        options.initialMaxRows ?? DEFAULT_QUERY_MAX_ROWS,
        options.initialPageSize ?? QUERY_RESULT_PAGE_SIZES[0],
      ),
    ];
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): number {
    return this.version;
  }

  get list(): readonly Worksheet[] {
    return this.worksheets;
  }

  get activeId(): string {
    return this.activeWorksheetId;
  }

  get active(): Worksheet {
    return this.worksheets.find((ws) => ws.id === this.activeWorksheetId) ?? this.worksheets[0]!;
  }

  activate(worksheetId: string): void {
    if (worksheetId === this.activeWorksheetId) return;
    this.worksheets = this.worksheets.map((ws) =>
      ws.id === this.activeWorksheetId
        ? { ...ws, parameterValues: {}, templateFieldErrors: {} }
        : ws,
    );
    this.activeWorksheetId = worksheetId;
    this.notify();
  }

  add(targetResourceId: number): Worksheet | null {
    if (this.worksheets.length >= MAX_WORKSHEETS) return null;
    this.nextIndex += 1;
    const unique = this.createId();
    const worksheet = createWorksheetRecord(
      `worksheet-${this.nextIndex}-${unique}`,
      `Worksheet ${this.nextIndex}`,
      targetResourceId,
      `req-${unique}`,
      this.active.maxRows,
      this.active.pageSize,
    );
    this.worksheets = [...this.worksheets, worksheet];
    this.activate(worksheet.id);
    return worksheet;
  }

  persistedSnapshot(): readonly QueryWorkspaceWorksheet[] {
    return this.worksheets.map((worksheet) => ({
      id: worksheet.id,
      name: worksheet.name,
      targetResourceId: worksheet.targetResourceId,
      statement: worksheet.statement,
      activeDatabase: worksheet.activeDatabase,
      activeSchema: worksheet.activeSchema,
    }));
  }

  hydrate(
    items: readonly QueryWorkspaceWorksheet[],
    fallbackTargetId: number,
    preferFallbackTarget = false,
  ): void {
    const maxRows = this.active.maxRows;
    const pageSize = this.active.pageSize;
    if (items.length === 0) {
      this.worksheets = [
        createWorksheetRecord(
          INITIAL_WORKSHEET_ID,
          "Worksheet 1",
          fallbackTargetId,
          "req-initial",
          maxRows,
          pageSize,
        ),
      ];
      this.activeWorksheetId = INITIAL_WORKSHEET_ID;
      this.nextIndex = 1;
      this.notify();
      return;
    }
    this.worksheets = items.map((item) => ({
      ...createWorksheetRecord(
        item.id,
        item.name,
        item.targetResourceId,
        `req-${item.id}`,
        maxRows,
        pageSize,
      ),
      // Restored PostgreSQL worksheets keep history scoped to their persisted
      // connection; reconcileConnection re-binds when the engine map was not
      // populated yet at hydrate time.
      ...(this.isPostgres(item.targetResourceId) && item.activeDatabase !== null
        ? { history: createHistoryState(item.targetResourceId, item.activeDatabase) }
        : {}),
      statement: item.statement,
      activeDatabase: item.activeDatabase,
      activeSchema: item.activeSchema ?? null,
    }));
    // An explicit pinned target (deep link) wins over restore order: activate
    // the first worksheet bound to it instead of blindly taking items[0].
    this.activeWorksheetId = (
      preferFallbackTarget
        ? (this.worksheets.find((ws) => ws.targetResourceId === fallbackTargetId) ?? this.worksheets[0]!)
        : this.worksheets[0]!
    ).id;
    this.nextIndex = this.worksheets.length;
    this.notify();
  }

  restoreDraft(input: {
    readonly targetId: number;
    readonly statement: string;
    readonly activeDatabase: string | null;
    readonly activeSchema?: string | null;
  }): Worksheet | null {
    const worksheet = this.add(input.targetId);
    if (!worksheet) return null;
    this.patch(worksheet.id, {
      statement: input.statement,
      activeDatabase: input.activeDatabase,
      activeSchema: input.activeSchema ?? null,
      ...(this.isPostgres(input.targetId) && input.activeDatabase !== null
        ? { history: createHistoryState(input.targetId, input.activeDatabase) }
        : {}),
      isDirty: true,
    });
    return this.active;
  }

  close(id: string): void {
    if (this.worksheets.length <= 1) return;
    this.abortInflight(id);
    const closedIndex = this.worksheets.findIndex((ws) => ws.id === id);
    const filtered = this.worksheets.filter((ws) => ws.id !== id);
    if (this.activeWorksheetId === id) {
      this.activeWorksheetId = filtered[Math.min(closedIndex, filtered.length - 1)]!.id;
    }
    this.worksheets = filtered;
    this.notify();
  }

  rename(id: string, newName: string): void {
    const trimmed = newName.trim();
    if (trimmed.length === 0) return;
    this.patch(id, { name: trimmed });
  }

  editStatement(statement: string): void {
    const worksheet = this.active;
    if (statement === worksheet.statement) return;

    const exitingTemplate =
      worksheet.templateStatementId !== null || worksheet.parameters.length > 0;
    const dropInFlight = worksheet.isExecuting;
    if (dropInFlight) this.abortInflight(worksheet.id);
    const invalidateDerived =
      exitingTemplate ||
      dropInFlight ||
      worksheet.previewProvenance !== null ||
      worksheet.relatedRecords.status !== "idle" ||
      worksheet.explain.status !== "idle" ||
      worksheet.formatError !== null;
    if (invalidateDerived && !dropInFlight) this.abortNavAttempt(worksheet.id);

    this.patch(worksheet.id, {
      statement,
      isDirty: true,
      formatError: null,
      ...(exitingTemplate
        ? {
            parameters: [],
            parameterValues: {},
            templateStatementId: null,
            templateFieldErrors: {},
            result: null,
            error: null,
          }
        : {}),
      ...(dropInFlight || exitingTemplate
        ? {
            requestId: this.createId(),
            isExecuting: false,
          }
        : {}),
      ...(invalidateDerived
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
  }

  replaceStatement(
    statement: string,
    parameters: readonly QuerySavedStatementParameterDefinition[] = [],
    formatError: string | null = null,
  ): void {
    const worksheet = this.active;
    this.abortNavAttempt(worksheet.id);
    this.patch(worksheet.id, {
      statement,
      parameters: [...parameters],
      parameterValues: {},
      templateStatementId: null,
      templateFieldErrors: {},
      formatError,
      result: null,
      error: null,
      isDirty: true,
      isExecuting: false,
      requestId: this.createId(),
      previewProvenance: null,
      relatedRecords: {
        status: "idle",
        generation: worksheet.relatedRecords.generation + 1,
      },
      explain: invalidateExplainState(worksheet.explain),
      currentPage: 1,
      resultPagination: null,
    });
  }

  loadSavedStatement(item: QuerySavedStatementRecord): void {
    const worksheet = this.active;
    // PostgreSQL-bound statements carry their authorized (database, schema)
    // scope; adopt it first so execution posts under the same connection pin.
    // The scope is revalidated against the live connection list by the shell.
    if (item.database && item.database !== worksheet.activeDatabase) {
      this.selectConnection(worksheet.id, item.database);
      if (item.schema) this.selectSchema(worksheet.id, item.schema);
    } else if (item.schema && item.schema !== worksheet.activeSchema) {
      this.selectSchema(worksheet.id, item.schema);
    }
    this.replaceStatement(item.statement, item.parameters);
    if (item.parameters.length > 0) {
      this.patch(worksheet.id, { templateStatementId: item.id });
    }
  }

  setParameterValue(name: string, value: string): void {
    const ws = this.active;
    const templateFieldErrors = { ...ws.templateFieldErrors };
    delete templateFieldErrors[name];
    if (ws.templateStatementId === null) {
      this.patch(ws.id, {
        parameterValues: { ...ws.parameterValues, [name]: value },
        templateFieldErrors,
      });
      return;
    }
    this.patch(ws.id, {
      parameterValues: { ...ws.parameterValues, [name]: value },
      templateFieldErrors,
      requestId: this.createId(),
      isExecuting: false,
      error: null,
    });
  }

  retarget(worksheetId: string, newTargetId: number): void {
    const worksheet = this.worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet) return;
    this.abortInflight(worksheetId);
    this.patch(worksheetId, {
      ...this.contextResetPatch(worksheet),
      targetResourceId: newTargetId,
      activeDatabase: null,
      activeSchema: null,
      formatError: null,
      history: createHistoryState(newTargetId),
      isDirty: false,
    });
  }

  setActiveDatabase(database: string | null): void {
    this.patch(this.active.id, { activeDatabase: database });
  }

  /**
   * Select a PostgreSQL composite connection (targetId, database). This is an
   * execution-context change: it aborts any in-flight request, clears the
   * schema pin, results, navigation provenance, completion plan, and template
   * binding (saved statements are bound to a specific database), and re-binds
   * history to the new connection scope. The draft statement text is kept.
   */
  selectConnection(worksheetId: string, database: string): void {
    const worksheet = this.worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet) return;
    this.abortInflight(worksheetId);
    this.patch(worksheetId, {
      ...this.contextResetPatch(worksheet),
      activeDatabase: database,
      activeSchema: null,
      history: createHistoryState(worksheet.targetResourceId, database),
    });
  }

  /**
   * Pin a PostgreSQL namespace for the selected connection. Clears context-
   * derived state (results, provenance, navigation, completion, template
   * binding) without touching history scope or the draft statement.
   */
  selectSchema(worksheetId: string, schema: string | null): void {
    const worksheet = this.worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet || worksheet.activeSchema === schema) return;
    this.abortInflight(worksheetId);
    this.patch(worksheetId, {
      ...this.contextResetPatch(worksheet),
      activeSchema: schema,
    });
  }

  /**
   * Revalidate a persisted/restored PostgreSQL context against the live
   * connection enumeration. When the bound database is no longer visible the
   * worksheet stops: connection and schema are cleared and all context-derived
   * state is dropped — never silently falls back to another connection. When
   * the connection is still valid but history was restored unscoped (engine
   * unknown at hydrate time), re-bind history to the validated connection.
   */
  reconcileConnection(worksheetId: string, databases: readonly string[]): void {
    const worksheet = this.worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet || worksheet.activeDatabase === null) return;
    if (!databases.includes(worksheet.activeDatabase)) {
      this.selectConnectionClear(worksheet);
      return;
    }
    // A worksheet restored before the engine map was populated may still carry
    // an unscoped history binding; pin it to the validated connection now.
    if (worksheet.history.boundDatabase !== worksheet.activeDatabase) {
      this.patch(worksheetId, {
        history: createHistoryState(worksheet.targetResourceId, worksheet.activeDatabase),
      });
    }
  }

  private selectConnectionClear(worksheet: Worksheet): void {
    this.abortInflight(worksheet.id);
    this.patch(worksheet.id, {
      ...this.contextResetPatch(worksheet),
      activeDatabase: null,
      activeSchema: null,
      history: createHistoryState(worksheet.targetResourceId),
    });
  }

  applyDefaultDatabase(targetId: number, defaultDb: string | null): void {
    if (!defaultDb) return;
    let changed = false;
    this.worksheets = this.worksheets.map((worksheet) => {
      if (worksheet.targetResourceId === targetId && worksheet.activeDatabase === null) {
        changed = true;
        return { ...worksheet, activeDatabase: defaultDb };
      }
      return worksheet;
    });
    if (changed) this.notify();
  }

  setMaxRows(worksheetId: string, maxRows: number): void {
    this.patch(worksheetId, {
      maxRows,
      requestId: this.createId(),
      isExecuting: false,
      currentPage: 1,
      resultPagination: null,
    });
  }

  setMaxRowsAll(maxRows: number): void {
    this.worksheets = this.worksheets.map((ws) => ({ ...ws, maxRows }));
    this.notify();
  }

  setPageSizeAll(pageSize: number): void {
    this.worksheets = this.worksheets.map((ws) => ({ ...ws, pageSize }));
    this.notify();
  }

  applyFormat(formatted: string, error: string | null): void {
    const worksheet = this.active;
    if (error) {
      this.patch(worksheet.id, { formatError: error });
      return;
    }
    const statementChanged = formatted !== worksheet.statement;
    if (statementChanged) this.abortNavAttempt(worksheet.id);
    this.patch(worksheet.id, {
      statement: formatted,
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
            currentPage: 1,
            resultPagination: null,
            parameters: [],
            parameterValues: {},
            templateStatementId: null,
            templateFieldErrors: {},
          }
        : {}),
    });
  }

  openForTarget(targetId: number): Worksheet | null {
    const previousActiveId = this.activeWorksheetId;
    this.worksheets = this.worksheets.map((ws) =>
      ws.id === previousActiveId ? { ...ws, explain: invalidateExplainState(ws.explain) } : ws,
    );
    return this.add(targetId);
  }

  openPreview(input: {
    readonly targetId: number;
    readonly database: string;
    readonly schema?: string;
    readonly table: string;
    readonly foreignKeys: readonly ForeignKeyDetail[];
    readonly foreignKeysTruncated: boolean;
  }): void {
    const pg = this.engineFor(input.targetId) === "postgresql";
    const statement = pg
      ? `SELECT * FROM ${input.schema ? `"${input.schema.replace(/"/g, '""')}".` : ""}"${input.table.replace(/"/g, '""')}" LIMIT ${DEFAULT_QUERY_MAX_ROWS}`
      : `SELECT * FROM \`${input.database.replace(/`/g, "``")}\`.\`${input.table.replace(/`/g, "``")}\` LIMIT ${DEFAULT_QUERY_MAX_ROWS}`;
    const worksheet = this.add(input.targetId);
    if (!worksheet) return;
    this.patch(worksheet.id, {
      name: `Preview: ${input.table}`,
      statement,
      ...(pg
        ? {
            activeDatabase: input.database,
            activeSchema: input.schema ?? null,
            history: createHistoryState(input.targetId, input.database),
          }
        : {}),
      previewProvenance: {
        targetId: input.targetId,
        database: input.database,
        ...(input.schema !== undefined ? { schema: input.schema } : {}),
        table: input.table,
        kind: "table",
        statement,
        foreignKeys: input.foreignKeys,
        foreignKeysTruncated: input.foreignKeysTruncated,
      },
    });
  }

  async run(): Promise<void> {
    const worksheet = this.active;
    if (worksheet.isExecuting || worksheet.statement.trim() === "") return;
    if (worksheet.templateStatementId !== null && !buildTemplateValues(worksheet)) return;
    // PostgreSQL requires a selected composite connection; refuse to send a
    // contextless request (the UI gates the same condition on the Run button).
    if (this.isPostgres(worksheet.targetResourceId) && !worksheet.activeDatabase) return;

    const requestId = this.createId();
    const provenance = worksheet.previewProvenance;
    const statementChanged = provenance !== null && worksheet.statement !== provenance.statement;
    // A new execution is a context change for the related-records panel: an
    // in-flight navigation is superseded, so its request is released too.
    this.abortNavAttempt(worksheet.id);
    this.patch(worksheet.id, {
      isExecuting: true,
      error: null,
      cancellation: { phase: "idle" },
      templateFieldErrors: {},
      requestId,
      isDirty: false,
      relatedRecords: {
        status: "idle",
        generation: worksheet.relatedRecords.generation + 1,
      },
      explain: invalidateExplainState(worksheet.explain),
      ...(statementChanged ? { previewProvenance: null } : {}),
    });
    await this.applyPage(worksheet.id, requestId, worksheet.targetResourceId, 1, worksheet.pageSize, worksheet.maxRows, worksheet.templateStatementId);
  }

  async nextPage(): Promise<void> {
    const worksheet = this.active;
    const pagination = worksheet.resultPagination;
    if (!worksheet.result || !pagination?.hasNextPage || worksheet.isExecuting) return;
    const requestId = this.createId();
    this.patch(worksheet.id, {
      isExecuting: true,
      error: null,
      cancellation: { phase: "idle" },
      templateFieldErrors: {},
      requestId,
    });
    await this.applyPage(
      worksheet.id,
      requestId,
      worksheet.targetResourceId,
      worksheet.currentPage + 1,
      worksheet.pageSize,
      worksheet.maxRows,
      worksheet.templateStatementId,
    );
  }

  async previousPage(): Promise<void> {
    const worksheet = this.active;
    const pagination = worksheet.resultPagination;
    if (!pagination || worksheet.currentPage <= 1 || !pagination.hasPreviousPage || worksheet.isExecuting) return;
    const requestId = this.createId();
    this.patch(worksheet.id, {
      isExecuting: true,
      error: null,
      cancellation: { phase: "idle" },
      templateFieldErrors: {},
      requestId,
    });
    await this.applyPage(
      worksheet.id,
      requestId,
      worksheet.targetResourceId,
      worksheet.currentPage - 1,
      worksheet.pageSize,
      worksheet.maxRows,
      worksheet.templateStatementId,
    );
  }

  async changePageSize(pageSize: number): Promise<void> {
    if (this.active.isExecuting) return;
    if (!(QUERY_RESULT_PAGE_SIZES as readonly number[]).includes(pageSize)) return;
    const worksheet = this.active;
    const requestId = this.createId();
    this.patch(worksheet.id, {
      isExecuting: true,
      error: null,
      cancellation: { phase: "idle" },
      templateFieldErrors: {},
      requestId,
      currentPage: 1,
      pageSize,
      resultPagination: null,
    });
    await this.applyPage(
      worksheet.id,
      requestId,
      worksheet.targetResourceId,
      1,
      pageSize,
      worksheet.maxRows,
      worksheet.templateStatementId,
    );
  }

  async explain(): Promise<void> {
    const worksheet = this.active;
    const statement = worksheet.statement.trim();
    if (worksheet.templateStatementId !== null || statement === "" || worksheet.isExecuting || worksheet.explain.status === "loading") {
      return;
    }
    const requestGeneration = worksheet.explain.requestGeneration + 1;
    const requestId = this.createId();
    const targetId = worksheet.targetResourceId;
    this.patch(worksheet.id, {
      requestId,
      isExecuting: false,
      explain: {
        status: "loading",
        requestGeneration,
        statementIdentity: statement,
        targetId,
        response: null,
        errorCode: null,
      },
    });
    try {
      const response = await this.ports.explain(targetId, {
        statement,
        ...(worksheet.activeDatabase !== null ? { database: worksheet.activeDatabase } : {}),
        ...(worksheet.activeSchema !== null ? { schema: worksheet.activeSchema } : {}),
      });
      const current = this.worksheets.find((ws) => ws.id === worksheet.id);
      if (
        !current ||
        current.explain.requestGeneration !== requestGeneration ||
        current.targetResourceId !== targetId ||
        current.explain.statementIdentity !== statement
      ) {
        return;
      }
      this.patch(worksheet.id, {
        explain: {
          status: "ready",
          requestGeneration,
          statementIdentity: statement,
          targetId,
          response,
          errorCode: null,
        },
      });
    } catch (caught) {
      const code = caught instanceof QueryExecuteError ? caught.code : ("internal_error" as const);
      const current = this.worksheets.find((ws) => ws.id === worksheet.id);
      if (
        !current ||
        current.explain.requestGeneration !== requestGeneration ||
        current.targetResourceId !== targetId ||
        current.explain.statementIdentity !== statement
      ) {
        return;
      }
      this.patch(worksheet.id, {
        explain: {
          status: "error",
          requestGeneration,
          statementIdentity: statement,
          targetId,
          response: null,
          errorCode: code,
        },
      });
    }
  }

  closeExplain(): void {
    this.patch(this.active.id, { explain: invalidateExplainState(this.active.explain) });
  }

  /**
   * One navigation intent = one attempt: target + source scope + FK + the
   * ordered local values + one key + one controller. An identical call while
   * the intent is in flight reuses it (never a second key, never a second
   * POST); a different intent supersedes — the old request is aborted under
   * its own key with a keyed state read-back, so the old SQL is never
   * pretended never to have run.
   */
  navigateRelated(foreignKey: string, localValues: readonly string[]): void {
    const worksheet = this.active;
    const provenance = worksheet.previewProvenance;
    if (!provenance) return;
    const targetId = worksheet.targetResourceId;
    const worksheetId = worksheet.id;
    const pg = this.isPostgres(targetId);
    const identity = JSON.stringify([
      targetId,
      provenance.database,
      provenance.schema ?? null,
      provenance.table,
      foreignKey,
      localValues,
    ]);
    if (this.navInflight.get(worksheetId)?.identity === identity) return;
    this.abortNavAttempt(worksheetId, true);

    const generation = worksheet.relatedRecords.generation + 1;
    const navId = this.createId();
    const key = pg ? this.createId() : null;
    const controller = new AbortController();
    const attempt: NavAttempt = {
      worksheetId,
      navId,
      identity,
      key,
      targetId,
      // The read-back scope is pinned at intent time — never re-read from the
      // current selectors, which the user may have switched since.
      database: pg ? provenance.database : null,
      controller,
    };
    this.navInflight.set(worksheetId, attempt);
    this.patch(worksheetId, { relatedRecords: { status: "loading", generation, foreignKey } });
    const request: RelatedRecordNavigationRequest = {
      source: {
        database: provenance.database,
        ...(provenance.schema !== undefined ? { schema: provenance.schema } : {}),
        object: provenance.table,
        kind: "table",
        foreignKey,
      },
      localValues: [...localValues],
      ...(key !== null ? { clientExecutionId: key } : {}),
    };
    void this.ports.navigateRelated(targetId, request, { signal: controller.signal }).then(
      (response) => {
        const ws = this.worksheets.find((item) => item.id === worksheetId);
        if (
          !ws ||
          ws.targetResourceId !== targetId ||
          ws.relatedRecords.generation !== generation ||
          ws.previewProvenance?.statement !== provenance.statement
        ) {
          return;
        }
        // Fail closed on a context echo that mismatches the request binding —
        // the same guard applyPage applies to ordinary executions. PostgreSQL
        // related-record responses always echo context; its absence is a
        // mismatch.
        if (
          pg &&
          (!response.context ||
            response.context.database !== provenance.database ||
            (provenance.schema !== undefined &&
              response.context.schema !== provenance.schema))
        ) {
          this.patch(worksheetId, {
            relatedRecords: { status: "error", generation, code: "internal_error" },
          });
          return;
        }
        this.patch(worksheetId, { relatedRecords: { status: "ready", generation, response } });
      },
      (error: unknown) => {
        const ws = this.worksheets.find((item) => item.id === worksheetId);
        if (!ws || ws.targetResourceId !== targetId || ws.relatedRecords.generation !== generation) return;
        if (isAbortError(error) || controller.signal.aborted) {
          // Superseded or closed navigation: the owning policy already
          // decided the outcome — never a synthesized error row.
          return;
        }
        const code = error instanceof QueryExecuteError ? error.code : ("internal_error" as const);
        this.patch(worksheetId, { relatedRecords: { status: "error", generation, code } });
        if (code === "execution_already_exists" && attempt.key !== null) {
          // The backend already holds this exact keyed request: convert the
          // rejection into a keyed state read under the pinned identity —
          // never a re-POST, never a fresh key. A client_execution_id_conflict
          // instead stops right here as the explicit error above.
          this.patch(worksheetId, {
            cancellation: { phase: "requested", key: attempt.key, database: attempt.database },
          });
          void this.probeExecutionState(worksheetId, null, targetId, attempt.database, attempt.key);
        }
      },
    ).finally(() => {
      // Release only this attempt's registration — a newer intent may
      // already own the slot.
      if (this.navInflight.get(worksheetId)?.navId === navId) {
        this.navInflight.delete(worksheetId);
      }
    });
  }

  closeRelatedRecords(): void {
    const worksheet = this.active;
    // Closing the panel while a navigation is in flight is the defined
    // user-intent abort: the keyed attempt is read back under its own key.
    this.abortNavAttempt(worksheet.id, true);
    this.patch(worksheet.id, {
      relatedRecords: { status: "idle", generation: worksheet.relatedRecords.generation + 1 },
    });
  }

  async refreshHistory(worksheetId?: string, requestedFilters?: QueryExecutionFilter): Promise<void> {
    const targetWorksheetId = worksheetId ?? this.activeWorksheetId;
    const worksheet = this.worksheets.find((ws) => ws.id === targetWorksheetId);
    if (!worksheet) return;
    const targetId = worksheet.targetResourceId;
    const nextGeneration = worksheet.history.generation + 1;
    const filters = requestedFilters ?? worksheet.history.filters;
    this.patch(targetWorksheetId, {
      history: {
        ...worksheet.history,
        replaceStatus: "loading",
        replaceError: undefined,
        appendStatus: "idle",
        appendError: undefined,
        items: [],
        nextCursor: null,
        filters,
        pendingFilters: requestedFilters === undefined ? worksheet.history.pendingFilters : filters,
        selectedRecordId: null,
        boundTargetId: targetId,
        generation: nextGeneration,
      },
    });
    try {
      const response = await this.ports.listExecutions(targetId, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { from: toRFC3339From(filters.from) } : {}),
        ...(filters.to ? { to: toRFC3339To(filters.to) } : {}),
        ...(worksheet.history.boundDatabase
          ? { database: worksheet.history.boundDatabase }
          : {}),
        pageSize: 20,
      });
      this.applyHistoryReplace(targetWorksheetId, targetId, nextGeneration, filters, response, "ready");
    } catch {
      this.applyHistoryReplace(targetWorksheetId, targetId, nextGeneration, filters, null, "error");
    }
  }

  async loadMoreHistory(worksheetId?: string): Promise<void> {
    const targetWorksheetId = worksheetId ?? this.activeWorksheetId;
    const worksheet = this.worksheets.find((ws) => ws.id === targetWorksheetId);
    if (!worksheet) return;
    const targetId = worksheet.targetResourceId;
    const { nextCursor, filters, generation } = worksheet.history;
    if (!nextCursor || worksheet.history.appendStatus === "loading") return;
    this.patch(targetWorksheetId, {
      history: { ...worksheet.history, appendStatus: "loading", appendError: undefined },
    });
    try {
      const response = await this.ports.listExecutions(targetId, {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { from: toRFC3339From(filters.from) } : {}),
        ...(filters.to ? { to: toRFC3339To(filters.to) } : {}),
        ...(worksheet.history.boundDatabase
          ? { database: worksheet.history.boundDatabase }
          : {}),
        cursor: nextCursor,
        pageSize: 20,
      });
      const current = this.worksheets.find((ws) => ws.id === targetWorksheetId);
      if (
        !current ||
        current.targetResourceId !== targetId ||
        current.history.boundTargetId !== targetId ||
        current.history.generation !== generation ||
        current.history.filters.status !== filters.status ||
        current.history.filters.from !== filters.from ||
        current.history.filters.to !== filters.to
      ) {
        return;
      }
      const seenIds = new Set(current.history.items.map((item) => recordKey(item)));
      const newItems = response.items.filter((item) => {
        const key = recordKey(item);
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      });
      this.patch(targetWorksheetId, {
        history: {
          ...current.history,
          items: [...current.history.items, ...newItems],
          nextCursor: response.nextCursor,
          appendStatus: "idle",
          appendError: undefined,
        },
      });
    } catch {
      const current = this.worksheets.find((ws) => ws.id === targetWorksheetId);
      if (
        !current ||
        current.targetResourceId !== targetId ||
        current.history.boundTargetId !== targetId ||
        current.history.generation !== generation
      ) {
        return;
      }
      this.patch(targetWorksheetId, {
        history: { ...current.history, appendStatus: "error", appendError: "historyAppendFailed" },
      });
    }
  }

  applyFilters(filters: QueryExecutionFilter): void {
    void this.refreshHistory(this.activeWorksheetId, filters);
  }

  openHistoryDetail(recordId: number): void {
    this.patch(this.active.id, { history: { ...this.active.history, selectedRecordId: recordId } });
  }

  closeHistoryDetail(): void {
    this.patch(this.active.id, { history: { ...this.active.history, selectedRecordId: null } });
  }

  patchActive(patch: Partial<Worksheet>): void {
    this.patch(this.active.id, patch);
  }

  private applyHistoryReplace(
    worksheetId: string,
    targetId: number,
    generation: number,
    filters: QueryExecutionFilter,
    response: QueryExecutionCursorPage | null,
    status: "ready" | "error",
  ): void {
    const current = this.worksheets.find((ws) => ws.id === worksheetId);
    if (
      !current ||
      current.targetResourceId !== targetId ||
      current.history.generation !== generation ||
      current.history.filters.status !== filters.status ||
      current.history.filters.from !== filters.from ||
      current.history.filters.to !== filters.to
    ) {
      return;
    }
    if (status === "error") {
      this.patch(worksheetId, {
        history: {
          ...current.history,
          replaceStatus: "error",
          replaceError: "historyLoadFailed",
          appendStatus: "idle",
          appendError: undefined,
          generation,
        },
      });
      return;
    }
    const seenIds = new Set<string>();
    const items = (response?.items ?? []).filter((item) => {
      const key = recordKey(item);
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });
    this.patch(worksheetId, {
      history: {
        ...current.history,
        replaceStatus: "ready",
        replaceError: undefined,
        items,
        nextCursor: response?.nextCursor ?? null,
        filters,
        appendStatus: "idle",
        appendError: undefined,
        boundTargetId: targetId,
        generation,
      },
    });
  }

  /**
   * User cancel: abort the in-flight HTTP request, then read the attempt's
   * server-side state back through history using the same clientExecutionId.
   * Local abort alone never produces a "stopped" claim — only the bounded
   * probe's outcome is rendered.
   */
  cancel(): void {
    const worksheet = this.active;
    if (!worksheet.isExecuting) return;
    const inflight = this.inflight.get(worksheet.id);
    if (!inflight || worksheet.cancellation.phase !== "idle") return;
    if (inflight.key === null) {
      // Keyless engines (MySQL/TiDB): the local abort ends the request; the
      // backend records its own terminal status and no keyed read-back exists.
      inflight.controller.abort();
      return;
    }
    this.patch(worksheet.id, {
      cancellation: {
        phase: "requested",
        key: inflight.key,
        database: inflight.database,
      },
    });
    inflight.controller.abort();
    void this.probeExecutionState(
      worksheet.id,
      inflight.requestId,
      inflight.targetId,
      inflight.database,
      inflight.key,
    );
  }

  /**
   * Bounded backoff read-back of one keyed attempt, registered as an owned
   * resource of that attempt: context switches, close and dispose reach and
   * abort a pending read, and a newer probe replaces (aborts) an older one.
   * Backoff waits, the in-flight GET and finalization share one total
   * deadline — a hanging read consumes the window and resolves `unknown`,
   * never a "stopped" claim. Late results patch only the owning attempt; a
   * retargeted/closed worksheet or a superseded identity resolves `unknown`
   * rather than leaving `requested` stuck.
   */
  private async probeExecutionState(
    worksheetId: string,
    requestId: string | null,
    targetId: number,
    database: string | null,
    key: string,
  ): Promise<void> {
    const controller = new AbortController();
    const registration: ProbeAttempt = { worksheetId, requestId, key, controller };
    this.probes.get(worksheetId)?.controller.abort();
    this.probes.set(worksheetId, registration);

    const deadline = Date.now() + PROBE_TOTAL_BUDGET_MS;
    // One timer = the whole window: backoff waits, the in-flight GET and the
    // finalization share it. When it fires the controller aborts, so a hanging
    // read consumes the remaining budget and the probe resolves `unknown`.
    let deadlineFired = false;
    const deadlineTimer = setTimeout(() => {
      deadlineFired = true;
      controller.abort();
    }, Math.max(0, deadline - Date.now()));
    const owns = (ws: Worksheet | undefined): boolean =>
      !!ws &&
      (requestId === null || ws.requestId === requestId) &&
      ws.cancellation.phase === "requested" &&
      ws.cancellation.key === key;
    const resolveOutcome = (outcome: CancellationOutcome): void => {
      const ws = this.worksheets.find((item) => item.id === worksheetId);
      if (!owns(ws)) {
        // Ownership drifted while the phase is still keyed to this probe
        // (e.g. the requestId moved): resolve unknown rather than leave the
        // cancel surface stuck on "requested" forever.
        if (ws && ws.cancellation.phase === "requested" && ws.cancellation.key === key) {
          this.patch(worksheetId, {
            cancellation: {
              phase: "resolved",
              key,
              database,
              requestId,
              outcome: { kind: "unknown" },
            },
          });
        }
        return;
      }
      this.patch(worksheetId, {
        cancellation: { phase: "resolved", key, database, requestId, outcome },
      });
    };

    let outcome: CancellationOutcome = { kind: "unknown" };
    try {
      for (const backoff of PROBE_BACKOFF_MS) {
        const budget = deadline - Date.now();
        if (budget <= 0) break;
        if (backoff > 0) {
          try {
            await sleepOrAbort(Math.min(backoff, budget), controller.signal);
          } catch {
            // The shared deadline may abort the wait (resolve below); an owner
            // abort (teardown, newer probe) leaves silently. A killed wait
            // loses no observation — the last completed read still stands.
            if (deadlineFired) break;
            return;
          }
        }
        const ws = this.worksheets.find((item) => item.id === worksheetId);
        if (!owns(ws)) {
          resolveOutcome(outcome);
          return;
        }
        if (deadline - Date.now() <= 0) break;
        try {
          const page = await this.ports.listExecutions(targetId, {
            ...(database ? { database } : {}),
            clientExecutionId: key,
            pageSize: 5,
            // The remaining budget, not a fresh per-poll budget: the shared
            // deadline aborts a hanging read and the probe resolves `unknown`
            // instead of pretending a bounded window existed.
            signal: controller.signal,
          });
          const record = page.items.find((item) => item.clientExecutionId === key);
          if (record?.kind === "execution") {
            outcome = {
              kind: "terminal",
              status: record.status,
              remoteState: record.remoteState ?? null,
            };
            break;
          }
          // A still-running claim (or nothing yet): keep polling inside the
          // shared window — a late `running` never overwrites a terminal row
          // because terminal exits the loop immediately.
          outcome =
            record?.kind === "claim" && record.status === "running"
              ? { kind: "running" }
              : { kind: "unknown" };
        } catch {
          if (controller.signal.aborted) {
            if (deadlineFired) {
              // The in-flight read was killed by the shared deadline and
              // produced no current state: an earlier `running` is stale and
              // must not be reused as this round's conclusion.
              outcome = { kind: "unknown" };
              break;
            }
            return;
          }
          // Transport/read failure: keep polling while budget remains.
          outcome = { kind: "unknown" };
        }
      }
      resolveOutcome(outcome);
    } finally {
      // Release only this probe's registration and timer — a newer attempt's
      // probe already in the slot is not ours to remove.
      clearTimeout(deadlineTimer);
      if (this.probes.get(worksheetId) === registration) {
        this.probes.delete(worksheetId);
      }
      controller.abort();
    }
  }

  /**
   * Fields every execution-context change resets: in-flight outputs, error
   * state, navigation provenance, template binding, and pagination. Callers
   * layer their scope-specific fields (connection/schema/history/target) on
   * top. The draft statement text is never touched here.
   */
  private contextResetPatch(worksheet: Worksheet): Partial<Worksheet> {
    return {
      cancellation: { phase: "idle" },
      result: null,
      error: null,
      isExecuting: false,
      requestId: this.createId(),
      previewProvenance: null,
      relatedRecords: {
        status: "idle",
        generation: worksheet.relatedRecords.generation + 1,
      },
      explain: invalidateExplainState(worksheet.explain),
      currentPage: 1,
      resultPagination: null,
      parameters: [],
      parameterValues: {},
      templateStatementId: null,
      templateFieldErrors: {},
    };
  }

  /** Abort and forget every request a worksheet owns: run, navigation, probe. */
  private abortInflight(worksheetId: string): void {
    const inflight = this.inflight.get(worksheetId);
    if (inflight) {
      this.inflight.delete(worksheetId);
      inflight.controller.abort();
    }
    this.abortNavAttempt(worksheetId);
    const probe = this.probes.get(worksheetId);
    if (probe) {
      this.probes.delete(worksheetId);
      probe.controller.abort();
    }
  }

  /**
   * Abort the worksheet's in-flight navigation attempt, if any. `readBack`
   * asks a keyed attempt for its server-side state under the pinned
   * key/database — used for user-intent aborts (supersede, panel close) so a
   * cancelled navigation is never pretended never to have run. Context
   * teardown aborts without it: the reset patch clears the cancellation
   * surface anyway.
   */
  private abortNavAttempt(worksheetId: string, readBack = false): void {
    const attempt = this.navInflight.get(worksheetId);
    if (!attempt) return;
    this.navInflight.delete(worksheetId);
    attempt.controller.abort();
    if (!readBack || attempt.key === null) return;
    const ws = this.worksheets.find((item) => item.id === worksheetId);
    if (!ws) return;
    this.patch(worksheetId, {
      cancellation: { phase: "requested", key: attempt.key, database: attempt.database },
    });
    void this.probeExecutionState(worksheetId, null, attempt.targetId, attempt.database, attempt.key);
  }

  /** Abort every request the session still owns: unmount, logout, teardown. */
  dispose(): void {
    for (const worksheetId of new Set([
      ...this.inflight.keys(),
      ...this.navInflight.keys(),
      ...this.probes.keys(),
    ])) {
      this.abortInflight(worksheetId);
    }
  }

  /**
   * Explicit user re-read of a resolved non-terminal cancellation outcome
   * (`running`/`unknown`). Re-probes only while the owning attempt still
   * owns the worksheet; otherwise a no-op — never a re-POST, never a new key.
   */
  refreshCancellation(): void {
    const worksheet = this.active;
    const state = worksheet.cancellation;
    if (state.phase !== "resolved" || state.outcome.kind === "terminal") return;
    if (state.requestId !== null && worksheet.requestId !== state.requestId) return;
    this.patch(worksheet.id, {
      cancellation: { phase: "requested", key: state.key, database: state.database },
    });
    void this.probeExecutionState(
      worksheet.id,
      state.requestId,
      worksheet.targetResourceId,
      state.database,
      state.key,
    );
  }

  private isPostgres(targetId: number): boolean {
    return this.engineFor(targetId) === "postgresql";
  }

  private async executePage(
    worksheet: Worksheet,
    targetId: number,
    page: number,
    pageSize: number,
    maxRows: number,
    signal: AbortSignal,
    clientExecutionId: string | undefined,
  ): Promise<QueryExecuteResponse | null> {
    const pg = this.isPostgres(targetId);
    const database = pg ? (worksheet.activeDatabase ?? undefined) : undefined;
    const schema = pg ? (worksheet.activeSchema ?? undefined) : undefined;
    if (worksheet.templateStatementId !== null) {
      const values = buildTemplateValues(worksheet);
      if (!values) return null;
      return this.ports.executeTemplate(
        targetId,
        worksheet.templateStatementId,
        {
          values,
          ...(clientExecutionId !== undefined ? { clientExecutionId } : {}),
          maxRows,
          pagination: { page, pageSize },
        },
        { ...(database !== undefined ? { database } : {}), signal },
      );
    }
    return this.ports.execute(
      targetId,
      {
        statement: worksheet.statement,
        ...(database !== undefined ? { database } : {}),
        ...(schema !== undefined ? { schema } : {}),
        ...(clientExecutionId !== undefined ? { clientExecutionId } : {}),
        maxRows,
        pagination: { page, pageSize },
      },
      { signal },
    );
  }

  private async applyPage(
    worksheetId: string,
    requestId: string,
    targetId: number,
    page: number,
    pageSize: number,
    maxRows: number,
    templateStatementId: number | null,
  ): Promise<void> {
    const worksheet = this.worksheets.find((ws) => ws.id === worksheetId);
    if (!worksheet || worksheet.requestId !== requestId) return;
    const pg = this.isPostgres(targetId);
    const clientExecutionId = pg ? this.createId() : undefined;
    const controller = new AbortController();
    this.inflight.set(worksheetId, {
      worksheetId,
      requestId,
      key: clientExecutionId ?? null,
      targetId,
      database: pg ? worksheet.activeDatabase : null,
      controller,
    });
    try {
      const response = await this.executePage(
        worksheet,
        targetId,
        page,
        pageSize,
        maxRows,
        controller.signal,
        clientExecutionId,
      );
      if (!response) return;
      // Fail closed on a context echo that mismatches the request binding —
      // rows from another database/schema are never rendered. PostgreSQL
      // executions always echo context; its absence is itself a mismatch.
      if (
        pg &&
        (!response.context ||
          response.context.database !== (worksheet.activeDatabase ?? "") ||
          (worksheet.activeSchema !== null &&
            response.context.schema !== worksheet.activeSchema))
      ) {
        this.guardedPatch(worksheetId, requestId, {
          result: null,
          error: new QueryExecuteError(
            0,
            "internal_error",
            "Execution context echo did not match the requested database/schema",
          ),
        });
        return;
      }
      this.guardedPatch(worksheetId, requestId, {
        result: response,
        currentPage: response.pagination?.page ?? page,
        resultPagination: response.pagination ?? null,
      });
    } catch (caught) {
      if (isAbortError(caught) || controller.signal.aborted) {
        // User/context-switch abort: cancellation state already tracks the
        // outcome via the bounded probe; do not synthesize an error row.
        return;
      }
      const templateError = caught instanceof QueryExecuteError ? caught : null;
      if (
        templateError?.code === "execution_already_exists" &&
        clientExecutionId !== undefined
      ) {
        // The backend already holds this exact keyed request: convert the
        // rejection into a keyed state read under the pinned identity —
        // never a re-POST, never a fresh key. A client_execution_id_conflict
        // instead falls through to the explicit error below.
        const attemptDatabase = pg ? worksheet.activeDatabase : null;
        this.guardedPatch(worksheetId, requestId, {
          isExecuting: false,
          cancellation: {
            phase: "requested",
            key: clientExecutionId,
            database: attemptDatabase,
          },
        });
        void this.probeExecutionState(
          worksheetId,
          requestId,
          targetId,
          attemptDatabase,
          clientExecutionId,
        );
        return;
      }
      this.guardedPatch(worksheetId, requestId, {
        result: null,
        error: templateError,
        ...(templateStatementId !== null ? { templateFieldErrors: templateError?.details ?? {} } : {}),
      });
    } finally {
      if (this.inflight.get(worksheetId)?.requestId === requestId) {
        this.inflight.delete(worksheetId);
      }
      this.guardedPatch(worksheetId, requestId, { isExecuting: false });
    }
  }

  private guardedPatch(worksheetId: string, requestId: string, patch: Partial<Worksheet>): void {
    const ws = this.worksheets.find((item) => item.id === worksheetId);
    if (!ws || ws.requestId !== requestId) return;
    this.patch(worksheetId, patch);
  }

  private patch(worksheetId: string, patch: Partial<Worksheet>): void {
    this.worksheets = this.worksheets.map((ws) => (ws.id === worksheetId ? { ...ws, ...patch } : ws));
    this.notify();
  }

  private notify(): void {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }
}

export function useWorksheetSessionVersion(session: WorksheetSession): number {
  return useSyncExternalStore(
    (listener) => session.subscribe(listener),
    () => session.getSnapshot(),
    () => session.getSnapshot(),
  );
}
