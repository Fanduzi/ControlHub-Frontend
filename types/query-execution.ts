import type { PageInfo } from "@/types/resource";
import type { ForeignKeyDetail } from "@/types/query-schema";

/**
 * Query execution wire types for the Phase 37 read-only sandbox. Mirror the
 * backend OpenAPI contract for `POST /query-targets/{id}/execute` and
 * `GET /query-targets/{id}/executions` exactly (field names and casing).
 *
 * The frontend never sends `actorUserId` and never receives credentials or
 * DSNs. History rows carry metadata only — never full result rows.
 */

/** Terminal status of an execution attempt. Matches the backend enum. */
export type QueryExecutionStatus = "success" | "rejected" | "failed" | "timeout";

/**
 * Request body for `POST /query-targets/{id}/execute`. Only `statement` and an
 * optional `maxRows` cap are ever sent. The actor is derived from the verified
 * Bearer token on the server — it must never appear here.
 */
export type QueryExecuteRequest = {
  statement: string;
  maxRows?: number;
};

/** One column descriptor in a result set. */
export type QueryResultColumn = {
  name: string;
  databaseType: string;
  nullable: boolean;
};

/**
 * A single JSON-safe result cell. The backend converts database values to
 * JSON-safe scalars; SQL NULL is preserved as `null` so the UI can render an
 * explicit NULL marker instead of coercing it to `0`, `""`, or `undefined`.
 */
export type QueryResultCellValue = string | number | boolean | null;

/** Response body for `POST /query-targets/{id}/execute`. */
export type QueryExecuteResponse = {
  executionId: number;
  status: QueryExecutionStatus;
  targetResourceId: number;
  engine: string;
  columns: QueryResultColumn[];
  rows: QueryResultCellValue[][];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  limitApplied: number;
  executedAt: string;
};

/**
 * One execution history row. Metadata only — digest/preview, status, row count,
 * duration, and controlled error fields. Never includes full result rows,
 * credentials, or DSNs.
 *
 * The actor is derived from the verified Bearer token on the server; the
 * frontend never sends or receives `actorUserId`.
 */
export type QueryExecutionRecord = {
  id: number;
  targetResourceId: number;
  actor: { displayName: string };
  engine: string;
  statementDigest: string;
  statementPreview: string;
  status: QueryExecutionStatus;
  rowCount: number;
  durationMs: number;
  errorCode: string;
  errorMessage: string;
  createdAt: string;
};

/** Response body for `GET /query-targets/{id}/executions`. */
export type QueryExecutionListResponse = {
  items: QueryExecutionRecord[];
  pageInfo: PageInfo;
};

/**
 * Source metadata for `POST /query-targets/{id}/related-records`. The browser
 * sends only trusted identifiers resolved from Object Explorer preview
 * provenance — never referenced table/column names, credentials, or SQL.
 */
export type RelatedRecordNavigationSource = {
  readonly database: string;
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
  readonly maxRows?: number;
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
  readonly table: string;
  readonly kind: "table";
  readonly foreignKeys: readonly ForeignKeyDetail[];
  readonly foreignKeysTruncated: boolean;
};
