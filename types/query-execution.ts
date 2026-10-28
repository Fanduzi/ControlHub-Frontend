// input: backend query execution OpenAPI schemas, resource/schema/disclosure types
// output: query execution transport contracts including server-owned restore eligibility
// pos: type-only boundary for governed query execution and history
// note: if this file changes, update this header and types/README.md.
import type { PageInfo } from "@/types/resource";
import type { ForeignKeyDetail } from "@/types/query-schema";
import type { ResultDisclosureMode } from "@/types/query-disclosure";

/**
 * Query execution wire types for the Phase 37 read-only sandbox. Mirror the
 * backend OpenAPI contract for `POST /query-targets/{id}/execute` and
 * `GET /query-targets/{id}/executions` exactly (field names and casing).
 *
 * The frontend never sends `actorUserId` and never receives credentials or
 * DSNs. History rows carry metadata only — never full result rows.
 */

/** Terminal status of an execution attempt. Matches the backend enum. */
export type QueryExecutionStatus =
  | "success"
  | "rejected"
  | "failed"
  | "timeout"
  | "cancelled";

/**
 * Derived status of an unlinked claim occupancy row in history. `running`
 * means the claim is still held; `unknown` means the claim's outcome was not
 * recorded before the owner exited. Neither is a persisted terminal state.
 */
export type QueryExecutionClaimStatus = "running" | "unknown";

/** Backend remote-cancel evidence reported on terminal history rows. */
export type QueryExecutionRemoteState = "completed" | "stopped" | "unknown";

// ─── Phase 38S: Governed query-result paging ────────────────────────────────

/** Page-number pagination request fields for governed result paging. */
export type QueryExecutePaginationRequest = {
  page: number;
  pageSize: number;
};

/** Page-number pagination response metadata for governed result paging. */
export type QueryExecutePaginationResponse = {
  page: number;
  pageSize: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

/**
 * Request body for `POST /query-targets/{id}/execute`. Only `statement`, an
 * optional `maxRows` cap, an optional structured `pagination` object, and the
 * fixed result-contract `capabilities` declaration are ever sent. The actor
 * is derived from the verified Bearer token on the server — it must never
 * appear here.
 *
 * Phase 38S adds the optional `pagination` object for page-number paging.
 * `maxRows` remains the overall row-release cap across all pages; it is
 * omitted from the wire body when not supplied, as is `pagination`.
 */
export type QueryExecuteRequest = {
  statement: string;
  /**
   * PostgreSQL connection database. Required non-empty for postgresql targets;
   * omitted for MySQL/TiDB (their browse database is not a connection identity).
   */
  database?: string;
  /** PostgreSQL namespace pin. Omitted for MySQL/TiDB and for default-schema requests. */
  schema?: string;
  /**
   * Idempotency key binding this attempt. Required non-empty (≤64) for
   * PostgreSQL; omitted for keyless MySQL/TiDB execution.
   */
  clientExecutionId?: string;
  maxRows?: number;
  pagination?: QueryExecutePaginationRequest;
  /** Fixed client result-contract declaration, e.g. `["cellTruncated"]`. */
  capabilities?: readonly string[];
};

/** One column descriptor in a result set. */
export type QueryResultColumn = {
  name: string;
  databaseType: string;
  nullable: boolean;
  /** Server-owned disclosure decision. */
  readonly displayMode: ResultDisclosureMode;
  /** Whether the value may be copied to clipboard. */
  readonly copyAllowed: boolean;
};

/**
 * A single JSON-safe result cell. The backend converts database values to
 * JSON-safe scalars; SQL NULL is preserved as `null` so the UI can render an
 * explicit NULL marker instead of coercing it to `0`, `""`, or `undefined`.
 */
export type QueryResultCellValue = string | number | boolean | null;

/**
 * Response body for `POST /query-targets/{id}/execute`. Phase 38S adds an
 * optional structured `pagination` object for page-number paging. The field
 * is absent in non-paged responses.
 */
export type QueryExecuteResponse = {
  executionId: number;
  status: QueryExecutionStatus;
  targetResourceId: number;
  engine: string;
  columns: QueryResultColumn[];
  rows: QueryResultCellValue[][];
  rowCount: number;
  /**
   * Per-cell truncation flags aligned with `rows`/`columns`. Present on every
   * non-empty success page; may be absent or empty on zero-row pages.
   * Validated by `normalizeExecuteResponse` before rendering.
   */
  cellTruncated?: boolean[][];
  truncated: boolean;
  durationMs: number;
  limitApplied: number;
  executedAt: string;
  pagination?: QueryExecutePaginationResponse;
  /**
   * Echoed PostgreSQL execution binding. Present on postgresql responses;
   * `schema` is the resolved namespace (connection default when the request
   * omitted it). Consumers must compare it against the request context before
   * trusting `rows`.
   */
  context?: { database: string; schema: string };
};

/**
 * One execution history row. Metadata only — digest/preview, status, row count,
 * duration, and controlled error fields. Never includes full result rows,
 * credentials, or DSNs.
 *
 * The actor is derived from the verified Bearer token on the server; the
 * frontend never sends or receives `actorUserId`.
 */
/** Fields shared by both history row kinds. */
type QueryExecutionRecordBase = {
  readonly kind: "execution" | "claim";
  readonly targetResourceId: number;
  readonly clientExecutionId: string | null;
  readonly actor: { displayName: string; kind?: "user" | "machine" } | null;
  readonly engine: string;
  /** PostgreSQL connection database; empty for MySQL/TiDB. */
  readonly database: string;
  /** PostgreSQL namespace; empty for MySQL/TiDB. */
  readonly schema: string;
  readonly statementDigest: string;
  readonly statementPreview: string;
  readonly canRestore: boolean;
  readonly rowCount: number;
  readonly durationMs: number;
  readonly errorCode: string;
  readonly errorMessage: string;
};

/** Persisted terminal execution row. `id` is the real history record id. */
export type QueryExecutionHistoryExecution = QueryExecutionRecordBase & {
  readonly kind: "execution";
  readonly id: number;
  readonly status: QueryExecutionStatus;
  readonly claimedAt?: string;
  readonly createdAt: string;
  readonly remoteState?: QueryExecutionRemoteState | null;
};

/**
 * Unlinked claim occupancy row. `id` is always null, status is a derived
 * `running`/`unknown` projection, and `createdAt` may be absent — claims are
 * not terminal evidence and must never be rendered as synthetic executions.
 */
export type QueryExecutionHistoryClaim = QueryExecutionRecordBase & {
  readonly kind: "claim";
  readonly id: null;
  readonly status: QueryExecutionClaimStatus;
  readonly claimedAt: string;
  readonly createdAt?: string;
  readonly canRestore: false;
};

/**
 * One execution history row — a discriminated union over `kind`.
 * Metadata only — digest/preview, status, row count, duration, and controlled
 * error fields. Never includes full result rows, credentials, or DSNs.
 */
export type QueryExecutionRecord =
  | QueryExecutionHistoryExecution
  | QueryExecutionHistoryClaim;

/** Stable per-row UI key that distinguishes real ids from claim occupancy. */
export function queryExecutionRecordKey(record: QueryExecutionRecord): string {
  return record.kind === "execution"
    ? `exec:${record.id}`
    : `claim:${record.clientExecutionId ?? record.claimedAt}`;
}

/** Response body for `GET /query-targets/{id}/executions`. */
export type QueryExecutionListResponse = {
  items: QueryExecutionRecord[];
  pageInfo: PageInfo;
};

/**
 * Response body for `GET /query-targets/{id}/executions`. The envelope is the
 * same for both cursor and legacy offset modes: `items` and `nextCursor` are
 * always present (`nextCursor` is `null` when no continuation exists or in
 * offset mode); `pageInfo` is present only for explicit legacy `?page=` offset
 * requests and is omitted in cursor mode.
 */
export type QueryExecutionCursorPage = {
  items: QueryExecutionRecord[];
  nextCursor: string | null;
  pageInfo?: PageInfo;
};

/** Full SQL is available only from the owner-only statement endpoint. */
export type QueryExecutionStatementResponse = {
  readonly statement: string;
};

/** Filter criteria for querying execution history. All fields are optional. */
export type QueryExecutionFilter = {
  readonly status?: QueryExecutionStatus;
  readonly from?: string;
  readonly to?: string;
  /** PostgreSQL connection scope; absent filters keep MySQL/TiDB semantics. */
  readonly database?: string;
  /** Point read-back for one keyed attempt (post-cancel state reconciliation). */
  readonly clientExecutionId?: string;
};

/**
 * Source metadata for `POST /query-targets/{id}/related-records`. The browser
 * sends only trusted identifiers resolved from Object Explorer preview
 * provenance — never referenced table/column names, credentials, or SQL.
 */
export type RelatedRecordNavigationSource = {
  readonly database: string;
  /** PostgreSQL namespace of the source object; omitted for MySQL/TiDB. */
  readonly schema?: string;
  readonly object: string;
  readonly kind: "table";
  readonly foreignKey: string;
};

/**
 * Request body for `POST /query-targets/{id}/related-records`. The browser
 * sends only source metadata and ordered scalar local values. The backend
 * resolves referenced identifiers and constructs parameterized SQL.
 *
 * `localValues` is ordered by FK column ordinal and must match the FK column
 * count exactly. Values are never interpolated into SQL, never stored in
 * history/audit, and never surface in UI text beyond the request body.
 */
export type RelatedRecordNavigationRequest = {
  readonly source: RelatedRecordNavigationSource;
  readonly localValues: readonly string[];
  /** Idempotency key; required non-empty for PostgreSQL navigation. */
  readonly clientExecutionId?: string;
  readonly maxRows?: number;
  /** Fixed client result-contract declaration, e.g. `["cellTruncated"]`. */
  readonly capabilities?: readonly string[];
};

/**
 * Response body for `POST /query-targets/{id}/related-records`. Extends the
 * base result shape with relation label fields safe to display. Never contains
 * SQL, credentials, DSN, or raw driver errors.
 */
export type RelatedRecordNavigationResponse = QueryExecuteResponse & {
  readonly sourceDatabase: string;
  readonly sourceObject: string;
  readonly foreignKey: string;
  readonly referencedDatabase: string;
  readonly referencedObject: string;
  readonly referencedColumns: readonly string[];
};

/**
 * Local-only preview request emitted by Object Explorer when the user clicks
 * "Preview rows" on a loaded table. This is never sent to the backend — it
 * only flows from Object Explorer through QueryWorkbench to QueryEditorShell
 * to create a trusted worksheet with provenance.
 */
export type TablePreviewRequest = {
  readonly targetId: number;
  readonly database: string;
  /** PostgreSQL namespace of the previewed object; omitted for MySQL/TiDB. */
  readonly schema?: string;
  readonly table: string;
  readonly kind: "table";
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
};

// ─── Phase 38N: Governed Explain ───────────────────────────────────────────
// The browser sends only the worksheet statement plus the target's already
// resolved (database, schema) scope to the governed Explain endpoint. It never
// constructs EXPLAIN, engine-specific syntax, or sends
// actor/role/credential/DSN fields. The backend owns wrapping the guarded
// SELECT in engine-specific syntax (MySQL EXPLAIN FORMAT=JSON, PostgreSQL
// EXPLAIN (FORMAT JSON)) and normalizing the raw plan into this versioned,
// leak-free response.

/** Request body for POST /query-targets/{id}/explain. */
export type ExplainRequest = {
  statement: string;
  /** Required for PostgreSQL targets: the pinned database identity. */
  database?: string;
  /** Optional for PostgreSQL targets: explicit schema pin (defaults to the connection's schema). */
  schema?: string;
};

/** Finite enum of normalized plan node operations. Matches the backend v1. */
export type ExplainNodeOperation =
  | "table_access"
  | "index_access"
  | "nested_loop"
  | "sort"
  | "aggregate"
  | "temporary_table"
  /** Known plan-structure nodes (Limit, Hash, Gather, Append…) kept for tree fidelity. */
  | "container"
  | "unknown";

/** Finite enum of normalized access types. Matches the backend v1.. */
export type ExplainNodeAccess =
  | "full_scan"
  | "index"
  | "unique_row"
  | "range"
  | "unknown";

/** Finite enum of backend-derived risk codes. Matches the backend v1. */
export type ExplainRiskCode =
  | "full_table_scan"
  | "filesort"
  | "temporary_table"
  | "high_estimated_rows"
  | "unknown_plan_shape";

/** Finite enum of risk severities. Matches the backend v1. */
export type ExplainRiskSeverity = "info" | "warning" | "critical";

/** One normalized plan node. No free-form engine strings leave the backend. */
export type ExplainNode = {
  id: string;
  parentId?: string | null;
  operation: ExplainNodeOperation;
  access: ExplainNodeAccess;
  estimatedRows?: number;
  usesIndex?: boolean;
  /** Engine planner-vocabulary node name (PostgreSQL "Node Type"), never user data. */
  label?: string;
  /** Planner scalar cost estimates (PostgreSQL Startup/Total Cost). */
  startupCost?: number;
  totalCost?: number;
};

/** One backend-derived risk signal with a finite severity. */
export type ExplainRisk = {
  code: ExplainRiskCode;
  severity: ExplainRiskSeverity;
};

/** Response body for POST /query-targets/{id}/explain. Versioned, normalized, leak-free. */
export type ExplainResponse = {
  targetResourceId: number;
  engine: "mysql" | "postgresql";
  formatVersion: number;
  nodes: ExplainNode[];
  risks: ExplainRisk[];
  truncated: boolean;
};
