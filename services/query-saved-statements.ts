import { apiClient, ApiError } from "@/services/api-client";
import { toQueryExecuteError } from "@/services/query-executions";
import type { QueryExecuteResponse } from "@/types/query-execution";
import type {
  QuerySavedStatementCreateRequest,
  QuerySavedStatementExecuteRequest,
  QuerySavedStatementListResponse,
  QuerySavedStatementRecord,
  QuerySavedStatementUpdateRequest,
} from "@/types/query-saved-statement";

/**
 * Controlled error from a saved statement operation. Wraps the shared
 * `ApiError` and adds a stable machine `code` for UI rendering.
 */
export class SavedStatementError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "SavedStatementError";
    this.status = status;
    this.code = code;
  }
}

export type SavedStatementErrorCode =
  | "validation_failed"
  | "not_found"
  | "saved_statement_not_found"
  | "forbidden"
  | "internal_error"
  | "service_unavailable";

function sanitizeParameterDefinitions(
  parameters: QuerySavedStatementCreateRequest["parameters"],
): QuerySavedStatementCreateRequest["parameters"] {
  return parameters?.map(({ name, type }) => ({ name, type })) ?? [];
}

function toSavedStatementError(error: unknown): SavedStatementError {
  if (error instanceof ApiError && error.status === 401) {
    throw error;
  }
  if (error instanceof ApiError) {
    const code =
      typeof error.code === "string" && error.code.length > 0
        ? error.code
        : "service_unavailable";
    return new SavedStatementError(error.status, code, error.message);
  }
  return new SavedStatementError(
    0,
    "service_unavailable",
    error instanceof Error ? error.message : "Saved statement operation failed",
  );
}

/**
 * List saved statements for a query target. Supports pagination and name
 * search. Never sends actorUserId or credentials.
 */
export async function listSavedStatements(
  targetResourceId: number,
  params: {
    q?: string;
    page?: number;
    pageSize?: number;
    signal?: AbortSignal;
  } = {},
): Promise<QuerySavedStatementListResponse> {
  const searchParams = new URLSearchParams();
  if (params.q) searchParams.set("q", params.q);
  if (params.page !== undefined) searchParams.set("page", String(params.page));
  if (params.pageSize !== undefined) searchParams.set("pageSize", String(params.pageSize));

  try {
    return await apiClient<QuerySavedStatementListResponse>(
      `/query-targets/${targetResourceId}/saved-statements?${searchParams.toString()}`,
      { signal: params.signal },
    );
  } catch (error) {
    throw toSavedStatementError(error);
  }
}

/**
 * Create a saved statement. Posts only `name`, `statement`, `scope`, and
 * `parameters` — never actor, owner, role, credentials, or DSNs.
 */
export async function createSavedStatement(
  targetResourceId: number,
  input: QuerySavedStatementCreateRequest,
): Promise<QuerySavedStatementRecord> {
  const body: QuerySavedStatementCreateRequest = {
    name: input.name,
    statement: input.statement,
    scope: input.scope,
    parameters: sanitizeParameterDefinitions(input.parameters),
  };

  try {
    return await apiClient<QuerySavedStatementRecord>(
      `/query-targets/${targetResourceId}/saved-statements`,
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    throw toSavedStatementError(error);
  }
}

/**
 * Update a saved statement. Posts `name`, `statement`, and `parameters`.
 * Scope is immutable and never sent on update.
 */
export async function updateSavedStatement(
  targetResourceId: number,
  statementId: number,
  input: QuerySavedStatementUpdateRequest,
): Promise<void> {
  const body: QuerySavedStatementUpdateRequest = {
    name: input.name,
    statement: input.statement,
    parameters: sanitizeParameterDefinitions(input.parameters),
  };

  try {
    await apiClient<void>(
      `/query-targets/${targetResourceId}/saved-statements/${statementId}`,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
    );
  } catch (error) {
    throw toSavedStatementError(error);
  }
}

/**
 * Execute a saved statement (static or parameterized template) through the
 * governed chain. Posts only typed `values`, an optional `maxRows` cap, and
 * an optional governed `pagination` object — never SQL text, parameter
 * declarations, actor identity, role, credentials, or DSNs. The server
 * re-reads and authorizes the latest saved statement for every execution and
 * page. Resolves with the existing execute envelope, or rejects with a
 * controlled `QueryExecuteError` carrying per-parameter field codes in
 * `details` (missing/unknown/invalid/oversized).
 */
export async function executeSavedStatementTemplate(
  targetResourceId: number,
  statementId: number,
  input: QuerySavedStatementExecuteRequest,
): Promise<QueryExecuteResponse> {
  const body: QuerySavedStatementExecuteRequest = {
    values: input.values,
    ...(input.maxRows !== undefined ? { maxRows: input.maxRows } : {}),
    ...(input.pagination !== undefined ? { pagination: input.pagination } : {}),
  };

  try {
    return await apiClient<QueryExecuteResponse>(
      `/query-targets/${targetResourceId}/saved-statements/${statementId}/execute`,
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
 * Delete a saved statement.
 */
export async function deleteSavedStatement(
  targetResourceId: number,
  statementId: number,
): Promise<void> {
  try {
    await apiClient<void>(
      `/query-targets/${targetResourceId}/saved-statements/${statementId}`,
      { method: "DELETE" },
    );
  } catch (error) {
    throw toSavedStatementError(error);
  }
}
