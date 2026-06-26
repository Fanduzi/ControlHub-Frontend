/**
 * Query credential metadata types for Phase 38A.
 *
 * These types mirror the backend OpenAPI contract for query credential
 * metadata management. The UI never collects, stores, or displays
 * DSN/password — only opaque metadata references.
 */

/** Runtime status values emitted by the backend credential resolver. */
export type QueryCredentialRuntimeStatus =
  | "missing_metadata"
  | "invalid_ref"
  | "disabled"
  | "policy_blocked"
  | "secret_missing"
  | "binding_mismatch"
  | "secret_resolved"
  | "unsupported_target"
  | "incomplete_connection";

/**
 * Environment policy values returned by the backend.
 *
 * The backend may return `"disabled"` when no metadata row exists or the
 * metadata is invalid. This value is read-only — it must never be sent in
 * an upsert request.
 */
export type QueryCredentialEnvironmentPolicy =
  | "disabled"
  | "non_prod_only"
  | "all_environments";

/** Writable environment policy values accepted by PUT requests. */
export type QueryCredentialWritableEnvironmentPolicy =
  | "non_prod_only"
  | "all_environments";

/** Response from GET /query-targets/{id}/credential. */
export type QueryCredentialStatusResponse = {
  resourceId: number;
  configured: boolean;
  engine: string;
  credentialRef: string;
  enabled: boolean;
  environmentPolicy: QueryCredentialEnvironmentPolicy;
  runtimeStatus: QueryCredentialRuntimeStatus;
  executionEligible: boolean;
  message: string;
};

/** Request body for PUT /query-targets/{id}/credential. */
export type QueryCredentialUpsertRequest = {
  credentialRef: string;
  enabled: boolean;
  environmentPolicy: QueryCredentialWritableEnvironmentPolicy;
  confirmAllEnvironments?: boolean;
};

/** All known runtime status values for client-side label resolution. */
export const KNOWN_CREDENTIAL_RUNTIME_STATUSES = new Set<string>([
  "missing_metadata",
  "invalid_ref",
  "disabled",
  "policy_blocked",
  "secret_missing",
  "binding_mismatch",
  "secret_resolved",
  "unsupported_target",
  "incomplete_connection",
]);

/** All known environment policy values (including read-only `disabled`). */
export const KNOWN_ENVIRONMENT_POLICIES = new Set<string>([
  "disabled",
  "non_prod_only",
  "all_environments",
]);
