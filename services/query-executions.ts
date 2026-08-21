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
 * `ApiError` thrown by the authenticated API client and copies the published
 * Controlled Error Code so the UI can render a distinct state without reading
 * HTTP status or `message`. Unknown codes are retained; missing codes and
 * transport failures become retryable `service_unavailable`.
 *
 * The actor is derived from the verified Bearer token on the server; nothing in
 * this module accepts or sends `actorUserId`.
 */
export class QueryExecuteError extends Error {
  status: number;
  code: string;
  details?: Record<string, string>;

  constructor(
    status: number,
    code: string,
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
 * Known Controlled Error Codes the query-execution UI localizes. Classification
 * still accepts any `ApiError.code`; unknown values stay on the error object.
 */
export type QueryExecuteErrorCode =
  | "validation_failed"
  | "query_not_allowed"
  | "query_target_not_found"
  | "query_explain_not_supported"
  | "query_result_disclosure_blocked"
  | "query_timeout"
  | "query_backend_error"
  | "internal_error"
  | "service_unavailable"
  | "forbidden"
  | "not_found"
  | "saved_statement_not_found";

const RETRYABLE_CONTROLLED_ERROR_CODES = new Set<string>([
  "internal_error",
  "query_backend_error",
  "query_timeout",
  "service_unavailable",
]);

/** Retry follows the Controlled Error Code, never HTTP status, once a code is present. */
export function isRetryableControlledErrorCode(code: string): boolean {
  return RETRYABLE_CONTROLLED_ERROR_CODES.has(code);
}

function rethrowUnauthorized(error: unknown): void {
  if (error instanceof ApiError && error.status === 401) {
    throw error;
  }
}

function controlledErrorCodeFromApiError(error: ApiError): string {
  return typeof error.code === "string" && error.code.length > 0
    ? error.code
    : "service_unavailable";
}

/** Convert the shared client's ApiError into a controlled QueryExecuteError. */
export function toQueryExecuteError(error: unknown): QueryExecuteError {
  rethrowUnauthorized(error);
  if (error instanceof ApiError) {
    return new QueryExecuteError(
      error.status,
      controlledErrorCodeFromApiError(error),
      error.message,
      error.details,
    );
  }
  return new QueryExecuteError(
    0,
    "service_unavailable",
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
 * Rejects with a controlled `QueryExecuteError` on HTTP errors, classified by
 * Controlled Error Code the same way as `executeQueryTarget`.
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
 * Rejects with a controlled `QueryExecuteError` on HTTP errors, classified by
 * Controlled Error Code the same way as `executeQueryTarget`.
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
