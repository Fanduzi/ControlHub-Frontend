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
 * The request body is explicitly whitelisted to contain only the four
 * allowed fields. Extra properties on `input` (e.g. actorUserId, dsn,
 * password, host, port) are silently dropped.
 */
export async function saveQueryCredential(
  targetResourceId: number,
  input: QueryCredentialUpsertRequest,
): Promise<QueryCredentialStatusResponse> {
  const body: Record<string, unknown> = {
    credentialRef: input.credentialRef,
    enabled: input.enabled,
    environmentPolicy: input.environmentPolicy,
  };
  if (input.confirmAllEnvironments !== undefined) {
    body.confirmAllEnvironments = input.confirmAllEnvironments;
  }
  return apiClient<QueryCredentialStatusResponse>(
    `/query-targets/${targetResourceId}/credential`,
    {
      method: "PUT",
      body: JSON.stringify(body),
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
