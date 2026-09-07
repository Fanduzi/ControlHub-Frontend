// input: query execution ports, saved-statement execute port, worksheet snapshot types, query-workspace persist types
// output: WorksheetSession (commands + persisted snapshot for the query workbench 工作表)
// pos: in-process worksheet session; React only renders
// note: if this file changes, update header and lib/README.md
import { useSyncExternalStore } from "react";

import {
  executeQueryTarget,
  explainQueryTarget,
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
  RelatedRecordNavigationRequest,
  RelatedRecordNavigationResponse,
} from "@/types/query-execution";
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
  generation: number;
};

export type PreviewProvenance = {
  readonly targetId: number;
  readonly database: string;
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
  activeDatabase: string | null;
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

export class WorksheetSession {
  private worksheets: Worksheet[];
  private activeWorksheetId: string;
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private readonly ports: WorksheetSessionPorts;
  private readonly createId: () => string;
  private nextIndex: number;

  constructor(options: {
    readonly initialTargetId: number;
    readonly ports?: Partial<WorksheetSessionPorts>;
    readonly createId?: () => string;
    readonly initialMaxRows?: number;
    readonly initialPageSize?: number;
  }) {
    this.ports = { ...defaultPorts, ...options.ports };
    this.createId = options.createId ?? (() => crypto.randomUUID());
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
    }));
  }

  hydrate(
    items: readonly QueryWorkspaceWorksheet[],
    fallbackTargetId: number,
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
      statement: item.statement,
      activeDatabase: item.activeDatabase,
    }));
    this.activeWorksheetId = this.worksheets[0]!.id;
    this.nextIndex = this.worksheets.length;
    this.notify();
  }

  restoreDraft(input: {
    readonly targetId: number;
    readonly statement: string;
    readonly activeDatabase: string | null;
  }): Worksheet | null {
    const worksheet = this.add(input.targetId);
    if (!worksheet) return null;
    this.patch(worksheet.id, {
      statement: input.statement,
      activeDatabase: input.activeDatabase,
      isDirty: true,
    });
    return this.active;
  }

  close(id: string): void {
    if (this.worksheets.length <= 1) return;
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

  replaceStatement(
    statement: string,
    parameters: readonly QuerySavedStatementParameterDefinition[] = [],
    formatError: string | null = null,
  ): void {
    const worksheet = this.active;
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
    this.replaceStatement(item.statement, item.parameters);
    if (item.parameters.length > 0) {
      this.patch(this.active.id, { templateStatementId: item.id });
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
    this.patch(worksheetId, {
      targetResourceId: newTargetId,
      activeDatabase: null,
      result: null,
      error: null,
      formatError: null,
      history: createHistoryState(newTargetId),
      isExecuting: false,
      requestId: this.createId(),
      isDirty: false,
      previewProvenance: null,
      relatedRecords: { status: "idle", generation: worksheet.relatedRecords.generation + 1 },
      explain: invalidateExplainState(worksheet.explain),
      currentPage: 1,
      resultPagination: null,
      parameters: [],
      parameterValues: {},
      templateStatementId: null,
      templateFieldErrors: {},
    });
  }

  setActiveDatabase(database: string | null): void {
    this.patch(this.active.id, { activeDatabase: database });
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
    readonly table: string;
    readonly foreignKeys: readonly ForeignKeyDetail[];
    readonly foreignKeysTruncated: boolean;
  }): void {
    const quotedDb = `\`${input.database.replace(/`/g, "``")}\``;
    const quotedTable = `\`${input.table.replace(/`/g, "``")}\``;
    const statement = `SELECT * FROM ${quotedDb}.${quotedTable} LIMIT ${DEFAULT_QUERY_MAX_ROWS}`;
    const worksheet = this.add(input.targetId);
    if (!worksheet) return;
    this.patch(worksheet.id, {
      name: `Preview: ${input.table}`,
      statement,
      previewProvenance: {
        targetId: input.targetId,
        database: input.database,
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

    const requestId = this.createId();
    const provenance = worksheet.previewProvenance;
    const statementChanged = provenance !== null && worksheet.statement !== provenance.statement;
    this.patch(worksheet.id, {
      isExecuting: true,
      error: null,
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
      const response = await this.ports.explain(targetId, { statement });
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

  navigateRelated(foreignKey: string, localValues: readonly string[]): void {
    const worksheet = this.active;
    const provenance = worksheet.previewProvenance;
    if (!provenance) return;
    const generation = worksheet.relatedRecords.generation + 1;
    const targetId = worksheet.targetResourceId;
    const worksheetId = worksheet.id;
    this.patch(worksheetId, { relatedRecords: { status: "loading", generation, foreignKey } });
    const request: RelatedRecordNavigationRequest = {
      source: {
        database: provenance.database,
        object: provenance.table,
        kind: "table",
        foreignKey,
      },
      localValues: [...localValues],
    };
    void this.ports.navigateRelated(targetId, request).then(
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
        this.patch(worksheetId, { relatedRecords: { status: "ready", generation, response } });
      },
      (error: unknown) => {
        const ws = this.worksheets.find((item) => item.id === worksheetId);
        if (!ws || ws.targetResourceId !== targetId || ws.relatedRecords.generation !== generation) return;
        const code = error instanceof QueryExecuteError ? error.code : ("internal_error" as const);
        this.patch(worksheetId, { relatedRecords: { status: "error", generation, code } });
      },
    );
  }

  closeRelatedRecords(): void {
    const worksheet = this.active;
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
      const seenIds = new Set(current.history.items.map((item) => item.id));
      const newItems = response.items.filter((item) => {
        if (seenIds.has(item.id)) return false;
        seenIds.add(item.id);
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
    const seenIds = new Set<number>();
    const items = (response?.items ?? []).filter((item) => {
      if (seenIds.has(item.id)) return false;
      seenIds.add(item.id);
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

  private async executePage(
    worksheet: Worksheet,
    targetId: number,
    page: number,
    pageSize: number,
    maxRows: number,
  ): Promise<QueryExecuteResponse | null> {
    if (worksheet.templateStatementId !== null) {
      const values = buildTemplateValues(worksheet);
      if (!values) return null;
      return this.ports.executeTemplate(targetId, worksheet.templateStatementId, {
        values,
        maxRows,
        pagination: { page, pageSize },
      });
    }
    return this.ports.execute(targetId, {
      statement: worksheet.statement,
      maxRows,
      pagination: { page, pageSize },
    });
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
    try {
      const response = await this.executePage(worksheet, targetId, page, pageSize, maxRows);
      if (!response) return;
      this.guardedPatch(worksheetId, requestId, {
        result: response,
        currentPage: response.pagination?.page ?? page,
        resultPagination: response.pagination ?? null,
      });
    } catch (caught) {
      const templateError = caught instanceof QueryExecuteError ? caught : null;
      this.guardedPatch(worksheetId, requestId, {
        result: null,
        error: templateError,
        ...(templateStatementId !== null ? { templateFieldErrors: templateError?.details ?? {} } : {}),
      });
    } finally {
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

/** @deprecated Name kept for call sites that still say LocalWorksheet. */
export type LocalWorksheet = Worksheet;
