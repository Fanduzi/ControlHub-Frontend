import { apiClient, ApiError } from "@/services/api-client";
import type {
  ExplainRequest,
  ExplainResponse,
  QueryExecuteRequest,
  QueryExecuteResponse,
  QueryExecutionCursorPage,
  QueryExecutionStatus,
  RelatedRecordNavigationRequest,
  RelatedRecordNavigationResponse,
} from "@/types/query-execution";

/**
 * Controlled error from a query execution attempt. Wraps the shared
 * `ApiError` thrown by the authenticated API client and adds the stable
 * machine `code` the backend pairs with each documented HTTP status, so the UI
 * can render a distinct controlled state (validation, policy, timeout, backend
 * failure) without ever touching the raw fetch `Response` or a stack trace.
 *
 * The actor is derived from the verified Bearer token on the server; nothing in
 * this module accepts or sends `actorUserId`.
 */
export class QueryExecuteError extends Error {
  status: number;
  code: QueryExecuteErrorCode;
  details?: Record<string, string>;

  constructor(
    status: number,
    code: QueryExecuteErrorCode,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message);
    this.name = "QueryExecuteError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Machine-readable error codes returned by the Phase 37 sandbox. These pair 1:1
 * with the backend's documented HTTP statuses (see the Phase 37 spec error
 * table) — the frontend maps status to code so render logic keys off the code.
 *
 * Phase 38Q adds `query_result_disclosure_blocked` for 403 responses where the
 * backend's error message identifies a disclosure-policy block (the message
 * contains "disclosure_blocked"). The frontend disambiguates by inspecting the
 * `ApiError.message` before falling back to the status-based mapping.
 */
export type QueryExecuteErrorCode =
  | "validation_failed"
  | "query_not_allowed"
  | "query_target_not_found"
  | "query_explain_not_supported"
  | "query_result_disclosure_blocked"
  | "query_timeout"
  | "query_backend_error"
  | "internal_error";

const STATUS_TO_ERROR_CODE: Readonly<Record<number, QueryExecuteErrorCode>> = {
  400: "validation_failed",
  403: "query_not_allowed",
  404: "query_target_not_found",
  408: "query_timeout",
  409: "query_explain_not_supported",
  500: "internal_error",
  502: "query_backend_error",
};

/** Default to a safe internal_error for any unmapped status. */
function errorCodeFromStatus(error: ApiError): QueryExecuteErrorCode {
  if (
    error.status === 403 &&
    error.message.includes("disclosure_blocked")
  ) {
    return "query_result_disclosure_blocked";
  }
  return STATUS_TO_ERROR_CODE[error.status] ?? "internal_error";
}

/** Convert the shared client's ApiError into a controlled QueryExecuteError. */
export function toQueryExecuteError(error: unknown): QueryExecuteError {
  if (error instanceof ApiError) {
    return new QueryExecuteError(
      error.status,
      errorCodeFromStatus(error),
      error.message,
      error.details,
    );
  }
  // Network failures or unexpected throws: surface a controlled internal error
  // rather than leaking the underlying value to the UI.
  return new QueryExecuteError(
    0,
    "internal_error",
    error instanceof Error ? error.message : "Query execution failed",
  );
}

/**
 * Execute a single guarded SELECT against a ready query target. Posts only
 * `statement`, an optional `maxRows` release cap, and an optional structured
 * `pagination` object — never `actorUserId` or credentials. Resolves with the
 * backend execution response, or rejects with a controlled `QueryExecuteError`.
 */
export async function executeQueryTarget(
  targetResourceId: number,
  input: QueryExecuteRequest,
): Promise<QueryExecuteResponse> {
  const body: QueryExecuteRequest = {
    statement: input.statement,
    ...(input.maxRows !== undefined ? { maxRows: input.maxRows } : {}),
    ...(input.pagination !== undefined ? { pagination: input.pagination } : {}),
  };

  try {
    return await apiClient<QueryExecuteResponse>(
      `/query-targets/${targetResourceId}/execute`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}

/**
 * List execution history (metadata only) for a query target. Supports cursor-
 * based pagination with optional status and date range filters. Never sends
 * `actorUserId`. Defaults pageSize to 20 — matching the backend default.
 */
export async function listQueryExecutions(
  targetResourceId: number,
  params: {
    status?: QueryExecutionStatus;
    from?: string;
    to?: string;
    cursor?: string;
    pageSize?: number;
  } = {},
): Promise<QueryExecutionCursorPage> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set("status", params.status);
  if (params.from) searchParams.set("from", params.from);
  if (params.to) searchParams.set("to", params.to);
  if (params.cursor) searchParams.set("cursor", params.cursor);
  searchParams.set("pageSize", String(params.pageSize ?? 20));

  return apiClient<QueryExecutionCursorPage>(
    `/query-targets/${targetResourceId}/executions?${searchParams.toString()}`,
  );
}

/**
 * Navigate to referenced records via a governed foreign key. Posts only source
 * metadata and ordered local values — never SQL, credentials, DSN, or
 * `actorUserId`. The backend resolves referenced identifiers and constructs
 * parameterized SQL server-side.
 *
 * Rejects with a controlled `QueryExecuteError` on HTTP errors, using the same
 * status-to-code mapping as `executeQueryTarget`.
 */
export async function navigateRelatedRecords(
  targetResourceId: number,
  input: RelatedRecordNavigationRequest,
): Promise<RelatedRecordNavigationResponse> {
  const body: RelatedRecordNavigationRequest = {
    source: input.source,
    localValues: input.localValues,
    ...(input.maxRows !== undefined ? { maxRows: input.maxRows } : {}),
  };

  try {
    return await apiClient<RelatedRecordNavigationResponse>(
      `/query-targets/${targetResourceId}/related-records`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}

/**
 * Explain a guarded SELECT against a ready query target. Posts only
 * `statement` — never EXPLAIN prefix, engine syntax, actorUserId, role,
 * credential, DSN, or risk score. The backend owns wrapping the guarded
 * SELECT in EXPLAIN FORMAT=JSON and normalizing the raw plan.
 *
 * Rejects with a controlled `QueryExecuteError` on HTTP errors, using the
 * same status-to-code mapping as `executeQueryTarget` plus the 409
 * `query_explain_not_supported` code for unsupported engines.
 */
export async function explainQueryTarget(
  targetResourceId: number,
  input: ExplainRequest,
  options?: { readonly signal?: AbortSignal },
): Promise<ExplainResponse> {
  const body: ExplainRequest = { statement: input.statement };
  try {
    return await apiClient<ExplainResponse>(
      `/query-targets/${targetResourceId}/explain`,
      {
        method: "POST",
        body: JSON.stringify(body),
        ...(options?.signal !== undefined ? { signal: options.signal } : {}),
      },
    );
  } catch (error) {
    throw toQueryExecuteError(error);
  }
}
