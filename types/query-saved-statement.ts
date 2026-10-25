import type { PageInfo } from "@/types/resource";
import type { QueryExecutePaginationRequest } from "@/types/query-execution";

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
  /** Bound connection database (non-empty for PostgreSQL-scoped statements). */
  readonly database: string;
  /** Bound PostgreSQL namespace; empty for MySQL/TiDB. */
  readonly schema: string;
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
  /** Required non-empty for PostgreSQL targets; omitted for MySQL/TiDB. */
  readonly database?: string;
  /** PostgreSQL namespace pin; omitted for MySQL/TiDB and default-schema binds. */
  readonly schema?: string;
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

/**
 * One wire value for a template parameter. Strings and decimals travel as
 * JSON strings (decimal precision is preserved), integers as JSON integers,
 * and booleans as JSON booleans — matching the backend Template Value
 * Encoding contract.
 */
export type QuerySavedStatementParameterValue = string | number | boolean;

/**
 * Request body for
 * `POST /query-targets/{id}/saved-statements/{statementId}/execute`.
 * Only typed `values`, an optional `maxRows` cap, and an optional governed
 * `pagination` object are ever sent. SQL text, parameter declarations,
 * identities, roles, credentials, and DSNs are never sent — the server
 * re-reads and authorizes the latest saved statement for every execution.
 */
export type QuerySavedStatementExecuteRequest = {
  readonly values: Readonly<Record<string, QuerySavedStatementParameterValue>>;
  /** Idempotency key; required non-empty for PostgreSQL statements. */
  readonly clientExecutionId?: string;
  readonly maxRows?: number;
  readonly pagination?: QueryExecutePaginationRequest;
  /** Fixed client result-contract declaration, e.g. `["cellTruncated"]`. */
  readonly capabilities?: readonly string[];
};
