import type {
  QueryTarget,
  QueryTargetAvailableActions,
  QueryTargetCapability,
  QueryTargetConnectionContext,
  QueryTargetGovernance,
  QueryTargetListResponse,
} from "@/types/query-target";

/**
 * Recursively partial, but arrays are replaceable wholesale (not element-wise
 * partial). Lets tests override a single nested field without restating the
 * full valid object.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

const DEFAULT_CONNECTION_CONTEXT: QueryTargetConnectionContext = {
  environment: "Production",
  owner: "DBA Team",
  engine: "clickhouse",
  host: "prod-ch-host-01.internal",
  port: 8123,
  clusterId: 14,
  clusterName: "Analytics ClickHouse Cluster",
};

const DEFAULT_CAPABILITY: QueryTargetCapability = {
  queryKind: "sql",
  editorMode: "sql",
  languageLabel: "SQL",
};

const DEFAULT_GOVERNANCE: QueryTargetGovernance = {
  executionEnabled: false,
  credentialState: "missing_readonly_credential",
  auditRequired: true,
  safetyState: "credential_missing",
  safetyNote: "Credential required.",
  policyNotes: ["Read-only credentials are required before execution."],
};

const DEFAULT_AVAILABLE_ACTIONS: QueryTargetAvailableActions = {
  run: false,
  explain: false,
  export: false,
  saveSheet: false,
  requestAccess: false,
};

/**
 * Build a valid QueryTarget for tests. Nested overrides are deep-merged so a
 * test can override a single field (e.g. `connectionContext.engine`) without
 * restating the whole object. Immutably produces a new target each call.
 */
export function buildQueryTarget(
  overrides: DeepPartial<QueryTarget> = {},
): QueryTarget {
  const connectionContext: QueryTargetConnectionContext = {
    ...DEFAULT_CONNECTION_CONTEXT,
    ...overrides.connectionContext,
  };
  const capability: QueryTargetCapability = {
    ...DEFAULT_CAPABILITY,
    ...overrides.capability,
  };
  const governance: QueryTargetGovernance = {
    ...DEFAULT_GOVERNANCE,
    ...overrides.governance,
  };
  const availableActions: QueryTargetAvailableActions = {
    ...DEFAULT_AVAILABLE_ACTIONS,
    ...overrides.availableActions,
  };

  return {
    resourceId: overrides.resourceId ?? 22,
    resourceName: overrides.resourceName ?? "analytics-ch-node-01",
    displayName: overrides.displayName ?? "Analytics ClickHouse Node 01",
    resourceType: overrides.resourceType ?? "database_instance",
    connectionContext,
    capability,
    readiness: overrides.readiness ?? "credential_required",
    missingFields: overrides.missingFields ?? ["readonlyCredential"],
    governance,
    availableActions,
    schemaPreview: overrides.schemaPreview ?? [],
  };
}

export function buildQueryTargetList(
  items: QueryTarget[] = [buildQueryTarget()],
): QueryTargetListResponse {
  return {
    items,
    pageInfo: {
      page: 1,
      pageSize: 50,
      totalItems: items.length,
      totalPages: items.length === 0 ? 0 : 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}
