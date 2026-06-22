import type { PageInfo } from "@/types/resource";

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
 */
export type QueryExecutionRecord = {
  id: number;
  targetResourceId: number;
  actorUserId: number;
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
