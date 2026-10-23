import { apiClient } from "@/services/api-client";
import type {
  QueryCredentialStatusResponse,
  QueryCredentialUpsertRequest,
} from "@/types/query-credential";

/**
 * Credential metadata is addressed by a COMPOSITE connection key:
 * (resourceId, database). The `database` segment is required non-empty for
 * PostgreSQL targets and must be absent for MySQL/TiDB targets, whose single
 * legacy row is addressed by resourceId alone.
 */
function credentialPath(targetResourceId: number, database?: string): string {
  const base = `/query-targets/${targetResourceId}/credential`;
  return database
    ? `${base}?database=${encodeURIComponent(database)}`
    : base;
}

/**
 * Fetch credential metadata status for a query target connection.
 *
 * Returns a stable object even when no metadata row exists. The response
 * never contains DSN or password — only opaque metadata and runtime status.
 */
export async function getQueryCredential(
  targetResourceId: number,
  database?: string,
): Promise<QueryCredentialStatusResponse> {
  return apiClient<QueryCredentialStatusResponse>(
    credentialPath(targetResourceId, database),
  );
}

/**
 * Save (create or update) credential metadata for a query target connection.
 *
 * The request body is explicitly whitelisted to contain only the allowed
 * fields. Extra properties on `input` (e.g. actorUserId, dsn, password,
 * host, port) are silently dropped. PostgreSQL connections additionally send
 * their defaultSchema, which the backend requires as part of the composite
 * identity.
 */
export async function saveQueryCredential(
  targetResourceId: number,
  input: QueryCredentialUpsertRequest,
  database?: string,
): Promise<QueryCredentialStatusResponse> {
  const body: Record<string, unknown> = {
    credentialRef: input.credentialRef,
    enabled: input.enabled,
    environmentPolicy: input.environmentPolicy,
  };
  if (input.confirmAllEnvironments !== undefined) {
    body.confirmAllEnvironments = input.confirmAllEnvironments;
  }
  if (input.defaultSchema) {
    body.defaultSchema = input.defaultSchema;
  }
  return apiClient<QueryCredentialStatusResponse>(
    credentialPath(targetResourceId, database),
    {
      method: "PUT",
      body: JSON.stringify(body),
    },
  );
}

/**
 * Delete credential metadata for a query target connection.
 *
 * After deletion, the target remains visible and locked as
 * credential_required.
 */
export async function deleteQueryCredential(
  targetResourceId: number,
  database?: string,
): Promise<void> {
  return apiClient<void>(credentialPath(targetResourceId, database), {
    method: "DELETE",
  });
}
