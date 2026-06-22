import { apiClient, ApiError } from "@/services/api-client";
import type {
  QueryExecuteRequest,
  QueryExecuteResponse,
  QueryExecutionListResponse,
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
 */
export type QueryExecuteErrorCode =
  | "validation_failed"
  | "query_not_allowed"
  | "query_target_not_found"
  | "query_timeout"
  | "query_backend_error"
  | "internal_error";

const STATUS_TO_ERROR_CODE: Readonly<Record<number, QueryExecuteErrorCode>> = {
  400: "validation_failed",
  403: "query_not_allowed",
  404: "query_target_not_found",
  408: "query_timeout",
  500: "internal_error",
  502: "query_backend_error",
};

/** Default to a safe internal_error for any unmapped status. */
function errorCodeFromStatus(status: number): QueryExecuteErrorCode {
  return STATUS_TO_ERROR_CODE[status] ?? "internal_error";
}

/** Convert the shared client's ApiError into a controlled QueryExecuteError. */
function toQueryExecuteError(error: unknown): QueryExecuteError {
  if (error instanceof ApiError) {
    return new QueryExecuteError(
      error.status,
      errorCodeFromStatus(error.status),
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
 * `statement` and an optional `maxRows` — never `actorUserId` or credentials.
 * Resolves with the backend execution response, or rejects with a controlled
 * `QueryExecuteError`.
 */
export async function executeQueryTarget(
  targetResourceId: number,
  input: QueryExecuteRequest,
): Promise<QueryExecuteResponse> {
  const body: QueryExecuteRequest = {
    statement: input.statement,
    ...(input.maxRows !== undefined ? { maxRows: input.maxRows } : {}),
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
 * List execution history (metadata only) for a query target. Never sends
 * `actorUserId`. Defaults to page 1, pageSize 20 — matching the backend default.
 */
export async function listQueryExecutions(
  targetResourceId: number,
  params: { page?: number; pageSize?: number } = {},
): Promise<QueryExecutionListResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  return apiClient<QueryExecutionListResponse>(
    `/query-targets/${targetResourceId}/executions?page=${page}&pageSize=${pageSize}`,
  );
}
