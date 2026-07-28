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
 * A saved statement record. Statement text is authorized user content —
 * never leak it into error messages, console logs, or unauthorized DOM.
 */
export type QuerySavedStatementRecord = {
  readonly id: number;
  readonly targetResourceId: number;
  readonly name: string;
  readonly statement: string;
  readonly scope: QuerySavedStatementScope;
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
 * Only `name`, `statement`, and `scope` are ever sent.
 * Never send actor, owner, role, credentials, DSNs, or browser state.
 */
export type QuerySavedStatementCreateRequest = {
  readonly name: string;
  readonly statement: string;
  readonly scope: QuerySavedStatementScope;
};

/**
 * Request body for `PUT /query-targets/{id}/saved-statements/{statementId}`.
 * Scope is immutable and never accepted on update.
 */
export type QuerySavedStatementUpdateRequest = {
  readonly name: string;
  readonly statement: string;
};
