import { apiClient } from "@/services/api-client";
import type {
  QueryCredentialStatusResponse,
  QueryCredentialUpsertRequest,
} from "@/types/query-credential";

/**
 * Fetch credential metadata status for a query target.
 *
 * Returns a stable object even when no metadata row exists. The response
 * never contains DSN or password — only opaque metadata and runtime status.
 */
export async function getQueryCredential(
  targetResourceId: number,
): Promise<QueryCredentialStatusResponse> {
  return apiClient<QueryCredentialStatusResponse>(
    `/query-targets/${targetResourceId}/credential`,
  );
}

/**
 * Save (create or update) credential metadata for a query target.
 *
 * The request body contains only: credentialRef, enabled, environmentPolicy,
 * and optionally confirmAllEnvironments. It must never contain actorUserId,
 * dsn, password, host, or port.
 */
export async function saveQueryCredential(
  targetResourceId: number,
  input: QueryCredentialUpsertRequest,
): Promise<QueryCredentialStatusResponse> {
  return apiClient<QueryCredentialStatusResponse>(
    `/query-targets/${targetResourceId}/credential`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

/**
 * Delete credential metadata for a query target.
 *
 * After deletion, the target remains visible and locked as
 * credential_required.
 */
export async function deleteQueryCredential(
  targetResourceId: number,
): Promise<void> {
  return apiClient<void>(
    `/query-targets/${targetResourceId}/credential`,
    {
      method: "DELETE",
    },
  );
}
