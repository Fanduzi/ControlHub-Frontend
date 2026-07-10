import type { ResourceType } from "@/types/resource";
import type { PageInfo } from "@/types/resource";

/**
 * Query target context read model consumed by the locked Query Workbench shell
 * (Phase 36). Mirrors the backend OpenAPI contract for `GET /query-targets`.
 *
 * No execution, credential, or live-schema state lives here. The frontend must
 * render workbench surfaces from this contract and must not reconstruct these
 * fields from hardcoded assumptions.
 */

/** How a target would be queried in a future workbench. */
export type QueryKind = "sql" | "redis" | "mongo" | "unsupported";

/** Explicit readiness of a query target. */
export type QueryTargetReadiness =
  | "ready"
  | "missing_connection"
  | "credential_required"
  | "unsupported_engine"
  | "disabled";

/** Safety boundary explaining why a target cannot execute queries today. */
export type QueryTargetSafetyState =
  | "credential_missing"
  | "execution_disabled"
  | "unsupported_engine"
  | "connection_incomplete"
  | "readonly_sandbox_enabled";

/** Editor mode selected by the frontend from capability, never guessed. */
export type QueryTargetEditorMode = "sql" | "redis" | "mongo" | "text";

/** Resolved connection context shown beside a target. No credentials here. */
export type QueryTargetConnectionContext = {
  environment: string;
  owner: string;
  engine: string;
  host: string;
  port: number;
  clusterId?: number;
  clusterName?: string;
};

/** Editor language and label for a target. */
export type QueryTargetCapability = {
  queryKind: QueryKind;
  editorMode: QueryTargetEditorMode;
  languageLabel: string;
};

/** Backend-owned governance state. executionEnabled is always false in Phase 36. */
export type QueryTargetGovernance = {
  executionEnabled: boolean;
  credentialState: string;
  auditRequired: boolean;
  safetyState: QueryTargetSafetyState;
  safetyNote: string;
  policyNotes: string[];
};

/** Locked/unlocked action flags. All false in Phase 36. */
export type QueryTargetAvailableActions = {
  run: boolean;
  explain: boolean;
  export: boolean;
  saveSheet: boolean;
  requestAccess: boolean;
};

/** Lightweight schema placeholder derived from existing metadata. */
export type QueryTargetSchemaPreviewNode = {
  kind: string;
  name: string;
  children?: QueryTargetSchemaPreviewNode[];
};

/** Read-only query capability context for one database resource. */
export type QueryTarget = {
  resourceId: number;
  resourceName: string;
  displayName: string;
  resourceType: ResourceType;
  connectionContext: QueryTargetConnectionContext;
  capability: QueryTargetCapability;
  readiness: QueryTargetReadiness;
  missingFields: string[];
  governance: QueryTargetGovernance;
  availableActions: QueryTargetAvailableActions;
  schemaPreview: QueryTargetSchemaPreviewNode[];
};

/** Envelope for `GET /query-targets`. */
export type QueryTargetListResponse = {
  items: QueryTarget[];
  pageInfo: PageInfo;
};

/**
 * Server-side filters for `GET /query-targets`. Query kind and readiness are
 * derived client-side from the bounded page of server-returned targets.
 */
export type QueryTargetListParams = {
  engine?: string;
  environmentId?: number;
  q?: string;
  targetId?: number;
  page?: number;
  pageSize?: number;
};
