/**
 * Server-owned disclosure mode for a result column. The backend decides
 * the mode; the frontend only renders the returned decision.
 * Empty string indicates a metadata query (SHOW TABLES, DESCRIBE, etc.)
 * which doesn't go through disclosure policy.
 */
export type ResultDisclosureMode =
  | "raw_copy_allowed"
  | "masked_no_copy"
  | "blocked"
  | "";

/**
 * Scope for a disclosure policy. Identifies exactly one column.
 */
export type DisclosurePolicyScope = {
  readonly targetResourceId: number;
  readonly databaseName: string;
  readonly objectName: string;
  readonly columnName: string;
};

/**
 * A persisted disclosure policy.
 */
export type DisclosurePolicy = DisclosurePolicyScope & {
  readonly id: number;
  readonly mode: "raw_copy_allowed" | "masked_no_copy";
  readonly createdAt: string;
  readonly updatedAt: string;
};

/**
 * Request body for creating/updating a disclosure policy.
 */
export type DisclosurePolicyUpsertRequest = DisclosurePolicyScope & {
  readonly mode: "raw_copy_allowed" | "masked_no_copy";
};

/**
 * Response for listing disclosure policies.
 */
export type DisclosurePolicyListResponse = {
  readonly items: DisclosurePolicy[];
};
