import type { PageInfo } from "@/types/resource";

/**
 * Saved statement wire types for Phase 38R governed saved queries.
 * Mirror the backend OpenAPI contract exactly (field names and casing).
 *
 * The frontend never sends `ownerUserId` and never receives credentials,
 * DSNs, or execution results. Statement text is authorized user content
 * visible only in the library and editor context.
 */

/** Immutable scope for a saved statement. */
export type QuerySavedStatementScope = "personal" | "shared_template";

/**
 * Supported parameter type identifiers. Mirrors the backend enum exactly.
 * The frontend uses these to render typed input controls and validate
 * parameter value formats before sending requests.
 */
export type QuerySavedStatementParameterType =
  | "string"
  | "integer"
  | "decimal"
  | "boolean";

/**
 * A single typed parameter declaration for a saved statement template.
 * `name` is a valid SQL identifier fragment (no control characters,
 * trimmed, non-empty, <= 64 code points). `type` determines the
 * expected value format.
 */
export type QuerySavedStatementParameterDefinition = {
  readonly name: string;
  readonly type: QuerySavedStatementParameterType;
};

/**
 * A saved statement record. Statement text is authorized user content —
 * never leak it into error messages, console logs, or unauthorized DOM.
 */
export type QuerySavedStatementRecord = {
  readonly id: number;
  readonly targetResourceId: number;
  readonly name: string;
  readonly statement: string;
  readonly scope: QuerySavedStatementScope;
  readonly parameters: readonly QuerySavedStatementParameterDefinition[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

/** Response body for `GET /query-targets/{id}/saved-statements`. */
export type QuerySavedStatementListResponse = {
  readonly items: readonly QuerySavedStatementRecord[];
  readonly pageInfo: PageInfo;
  readonly canManageSharedTemplates: boolean;
};

/**
 * Request body for `POST /query-targets/{id}/saved-statements`.
 * Only `name`, `statement`, `scope`, and `parameters` are ever sent.
 * Never send actor, owner, role, credentials, DSNs, or browser state.
 */
export type QuerySavedStatementCreateRequest = {
  readonly name: string;
  readonly statement: string;
  readonly scope: QuerySavedStatementScope;
  readonly parameters: readonly QuerySavedStatementParameterDefinition[];
};

/**
 * Request body for `PUT /query-targets/{id}/saved-statements/{statementId}`.
 * Scope is immutable and never accepted on update.
 */
export type QuerySavedStatementUpdateRequest = {
  readonly name: string;
  readonly statement: string;
  readonly parameters: readonly QuerySavedStatementParameterDefinition[];
};
