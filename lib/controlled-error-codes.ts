// input: none
// output: CONTROLLED_ERROR_CODES const list and ControlledErrorCode union
// pos: closed console union of OpenAPI ErrorResponse.error; not generated
// note: if this file changes, update header and lib/README.md

/**
 * Closed Controlled Error Code set. Must match OpenAPI `ErrorResponse.error`.
 * Maintained by hand and compared by `scripts/check-controlled-error-codes.mjs`.
 * Do not generate this list from OpenAPI.
 */
export const CONTROLLED_ERROR_CODES = [
  "disclosure_policy_conflict",
  "disclosure_policy_not_found",
  "environment_not_found",
  "forbidden",
  "forbidden_header",
  "internal_error",
  "invalid_credentials",
  "invalid_payload",
  "invalid_request",
  "malformed_json",
  "not_found",
  "owner_not_found",
  "payload_too_large",
  "profile_not_supported",
  "query_backend_error",
  "query_explain_not_supported",
  "query_not_allowed",
  "query_result_disclosure_blocked",
  "query_target_not_found",
  "query_timeout",
  "relation_conflict",
  "relation_not_found",
  "relationship_map_not_supported",
  "resource_archived",
  "resource_conflict",
  "resource_not_found",
  "saved_statement_not_found",
  "schema_backend_error",
  "schema_definition_not_supported",
  "schema_not_allowed",
  "schema_object_not_found",
  "schema_target_not_found",
  "schema_timeout",
  "schema_validation_failed",
  "service_unavailable",
  "unauthorized",
  "validation_failed",
] as const;

export type ControlledErrorCode = (typeof CONTROLLED_ERROR_CODES)[number];
