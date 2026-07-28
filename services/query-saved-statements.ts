import { apiClient, ApiError } from "@/services/api-client";
import type {
  QuerySavedStatementCreateRequest,
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
  code: SavedStatementErrorCode;

  constructor(status: number, code: SavedStatementErrorCode, message: string) {
    super(message);
    this.name = "SavedStatementError";
    this.status = status;
    this.code = code;
  }
}

export type SavedStatementErrorCode =
  | "validation_failed"
  | "not_found"
  | "forbidden"
  | "internal_error";

const STATUS_TO_ERROR_CODE: Readonly<Record<number, SavedStatementErrorCode>> = {
  400: "validation_failed",
  403: "forbidden",
  404: "not_found",
  500: "internal_error",
};

function toSavedStatementError(error: unknown): SavedStatementError {
  if (error instanceof ApiError) {
    return new SavedStatementError(
      error.status,
      STATUS_TO_ERROR_CODE[error.status] ?? "internal_error",
      error.message,
    );
  }
  return new SavedStatementError(
    0,
    "internal_error",
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
 * Create a saved statement. Posts only `name`, `statement`, and `scope` —
 * never actor, owner, role, credentials, or DSNs.
 */
export async function createSavedStatement(
  targetResourceId: number,
  input: QuerySavedStatementCreateRequest,
): Promise<QuerySavedStatementRecord> {
  const body: QuerySavedStatementCreateRequest = {
    name: input.name,
    statement: input.statement,
    scope: input.scope,
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
 * Update a saved statement. Posts only `name` and `statement` — scope is
 * immutable and never sent on update.
 */
export async function updateSavedStatement(
  targetResourceId: number,
  statementId: number,
  input: QuerySavedStatementUpdateRequest,
): Promise<void> {
  const body: QuerySavedStatementUpdateRequest = {
    name: input.name,
    statement: input.statement,
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
