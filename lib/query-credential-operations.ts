/**
 * Pure derivation helpers for the Phase 38B query credential operations
 * experience. These functions produce a coverage read model from
 * `QueryTarget[]` plus per-target `QueryCredentialStatusResponse` results.
 *
 * No React hooks, no network calls — pure data transformations only.
 */

import type {
  QueryCredentialRuntimeStatus,
  QueryCredentialStatusResponse,
} from "@/types/query-credential";
import type { QueryTarget } from "@/types/query-target";

// ---------------------------------------------------------------------------
// Normalized operation row
// ---------------------------------------------------------------------------

/** Per-target credential operation row, merged from target + credential status. */
export type CredentialOperationRow = {
  resourceId: number;
  displayName: string;
  resourceName: string;
  engine: string;
  environment: string;
  clusterName: string;
  host: string;
  port: number;
  /** Credential status from the per-target API, or null if fetch failed/pending. */
  credential: QueryCredentialStatusResponse | null;
  /** Error message when the credential fetch failed. */
  fetchError: string | null;
  /** Runtime status from credential API, or derived from fetch state. */
  runtimeStatus: QueryCredentialRuntimeStatus | "fetch_pending" | "fetch_error";
  /** Whether the target is selectable for bulk operations. */
  selectable: boolean;
  /** Reason the target is not selectable, if applicable. */
  notSelectableReason: string | null;
};

// ---------------------------------------------------------------------------
// Coverage counts
// ---------------------------------------------------------------------------

export type CoverageCounts = {
  total: number;
  ready: number;
  missingMetadata: number;
  secretMissing: number;
  bindingMismatch: number;
  invalidRef: number;
  policyBlocked: number;
  disabled: number;
  unsupportedOrIncomplete: number;
  fetchPending: number;
  fetchError: number;
};

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export type GroupingMode = "flat" | "environment" | "cluster";

export type CredentialGroup = {
  key: string;
  label: string;
  rows: CredentialOperationRow[];
};

// ---------------------------------------------------------------------------
// Per-target operation result (for bulk apply/remove)
// ---------------------------------------------------------------------------

export type TargetOperationStatus = "pending" | "success" | "failure";

export type TargetOperationResult = {
  resourceId: number;
  displayName: string;
  status: TargetOperationStatus;
  error: string | null;
  runtimeStatusAfter: QueryCredentialRuntimeStatus | null;
};

// ---------------------------------------------------------------------------
// Selection rules
// ---------------------------------------------------------------------------

/**
 * Determine whether a query target is selectable for bulk credential
 * operations. Only complete MySQL/TiDB targets with known-good states are
 * selectable. Unsupported engines and incomplete connections are visible but
 * disabled.
 */
export function isTargetSelectable(
  target: QueryTarget,
): { selectable: boolean; reason: string | null } {
  const engine = target.connectionContext.engine.toLowerCase();
  const supportedEngines = ["mysql", "tidb"];

  if (!supportedEngines.includes(engine)) {
    return {
      selectable: false,
      reason: "unsupported_engine",
    };
  }

  if (
    target.readiness === "missing_connection" ||
    target.missingFields.includes("host") ||
    target.missingFields.includes("port")
  ) {
    return {
      selectable: false,
      reason: "incomplete_connection",
    };
  }

  return { selectable: true, reason: null };
}

// ---------------------------------------------------------------------------
// Coverage derivation
// ---------------------------------------------------------------------------

/**
 * Derive the coverage counts from operation rows. Pure — takes rows, returns
 * counts.
 */
export function deriveCoverageCounts(
  rows: CredentialOperationRow[],
): CoverageCounts {
  const counts: CoverageCounts = {
    total: rows.length,
    ready: 0,
    missingMetadata: 0,
    secretMissing: 0,
    bindingMismatch: 0,
    invalidRef: 0,
    policyBlocked: 0,
    disabled: 0,
    unsupportedOrIncomplete: 0,
    fetchPending: 0,
    fetchError: 0,
  };

  for (const row of rows) {
    switch (row.runtimeStatus) {
      case "secret_resolved":
        counts.ready += 1;
        break;
      case "missing_metadata":
        counts.missingMetadata += 1;
        break;
      case "secret_missing":
        counts.secretMissing += 1;
        break;
      case "binding_mismatch":
        counts.bindingMismatch += 1;
        break;
      case "invalid_ref":
        counts.invalidRef += 1;
        break;
      case "policy_blocked":
        counts.policyBlocked += 1;
        break;
      case "disabled":
        counts.disabled += 1;
        break;
      case "unsupported_target":
      case "incomplete_connection":
        counts.unsupportedOrIncomplete += 1;
        break;
      case "fetch_pending":
        counts.fetchPending += 1;
        break;
      case "fetch_error":
        counts.fetchError += 1;
        break;
      default:
        // Unknown status — treat as non-ready and count under disabled.
        counts.disabled += 1;
        break;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Build operation rows
// ---------------------------------------------------------------------------

/**
 * Merge query targets with their credential status responses into normalized
 * operation rows. Credential status may be null (pending/error).
 */
export function buildOperationRows(
  targets: QueryTarget[],
  credentialMap: Map<number, QueryCredentialStatusResponse | null>,
  errorMap: Map<number, string>,
): CredentialOperationRow[] {
  return targets.map((target) => {
    const credential = credentialMap.get(target.resourceId) ?? null;
    const fetchError = errorMap.get(target.resourceId) ?? null;
    const selection = isTargetSelectable(target);

    let runtimeStatus: CredentialOperationRow["runtimeStatus"];
    if (fetchError) {
      runtimeStatus = "fetch_error";
    } else if (credential === null) {
      runtimeStatus = "fetch_pending";
    } else {
      runtimeStatus = credential.runtimeStatus;
    }

    return {
      resourceId: target.resourceId,
      displayName: target.displayName,
      resourceName: target.resourceName,
      engine: target.connectionContext.engine,
      environment: target.connectionContext.environment,
      clusterName: target.connectionContext.clusterName ?? "",
      host: target.connectionContext.host,
      port: target.connectionContext.port,
      credential,
      fetchError,
      runtimeStatus,
      selectable: selection.selectable,
      notSelectableReason: selection.reason,
    };
  });
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/**
 * Group operation rows by the selected mode. Returns flat (single group) for
 * "flat" mode, or groups by environment/cluster.
 */
export function groupOperationRows(
  rows: CredentialOperationRow[],
  mode: GroupingMode,
): CredentialGroup[] {
  if (mode === "flat") {
    return [{ key: "all", label: "", rows }];
  }

  const field = mode === "environment" ? "environment" : "clusterName";
  const groupMap = new Map<string, CredentialOperationRow[]>();

  for (const row of rows) {
    const groupKey = row[field] || "(none)";
    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.push(row);
    } else {
      groupMap.set(groupKey, [row]);
    }
  }

  return [...groupMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupRows]) => ({
      key,
      label: key,
      rows: groupRows,
    }));
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

export type CredentialFilterState = {
  search: string;
  environment: string;
  cluster: string;
  engine: string;
  runtimeStatus: string;
  configuredState: string; // "all" | "configured" | "unconfigured"
  readinessFilter: string; // "all" | "ready" | "not_ready"
};

export const EMPTY_CREDENTIAL_FILTERS: CredentialFilterState = {
  search: "",
  environment: "",
  cluster: "",
  engine: "",
  runtimeStatus: "",
  configuredState: "all",
  readinessFilter: "all",
};

export const ALL_FILTER_VALUE = "all";

/**
 * Apply credential filters to operation rows. Pure — returns a new array.
 */
export function filterCredentialRows(
  rows: CredentialOperationRow[],
  filters: CredentialFilterState,
): CredentialOperationRow[] {
  return rows.filter((row) => {
    // Search
    const q = filters.search.trim().toLowerCase();
    if (q) {
      const haystack = [row.displayName, row.resourceName, row.engine, row.host, row.environment, row.clusterName]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    // Environment
    if (filters.environment && filters.environment !== ALL_FILTER_VALUE) {
      if (row.environment !== filters.environment) return false;
    }

    // Cluster
    if (filters.cluster && filters.cluster !== ALL_FILTER_VALUE) {
      if (row.clusterName !== filters.cluster) return false;
    }

    // Engine
    if (filters.engine && filters.engine !== ALL_FILTER_VALUE) {
      if (row.engine !== filters.engine) return false;
    }

    // Runtime status
    if (filters.runtimeStatus && filters.runtimeStatus !== ALL_FILTER_VALUE) {
      if (filters.runtimeStatus === "needs_attention") {
        const attentionStatuses = ["missing_metadata", "secret_missing", "binding_mismatch", "invalid_ref", "policy_blocked", "disabled"];
        if (!attentionStatuses.includes(row.runtimeStatus)) return false;
      } else {
        if (row.runtimeStatus !== filters.runtimeStatus) return false;
      }
    }

    // Configured state
    if (filters.configuredState === "configured") {
      if (!row.credential?.configured) return false;
    } else if (filters.configuredState === "unconfigured") {
      if (row.credential?.configured) return false;
    }

    // Readiness filter
    if (filters.readinessFilter === "ready") {
      if (row.runtimeStatus !== "secret_resolved") return false;
    } else if (filters.readinessFilter === "not_ready") {
      if (row.runtimeStatus === "secret_resolved") return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Collect unique values for filter dropdowns
// ---------------------------------------------------------------------------

export function collectEnvironments(rows: CredentialOperationRow[]): string[] {
  return [...new Set(rows.map((r) => r.environment))].filter(Boolean).sort();
}

export function collectClusters(rows: CredentialOperationRow[]): string[] {
  return [...new Set(rows.map((r) => r.clusterName))].filter(Boolean).sort();
}

export function collectEngines(rows: CredentialOperationRow[]): string[] {
  return [...new Set(rows.map((r) => r.engine))].filter(Boolean).sort();
}

export function collectRuntimeStatuses(
  rows: CredentialOperationRow[],
): string[] {
  return [...new Set(rows.map((r) => r.runtimeStatus))].filter(Boolean).sort();
}

// ---------------------------------------------------------------------------
// Bulk request body builder (whitelist enforcement)
// ---------------------------------------------------------------------------

/**
 * Build a PUT request body for credential metadata. Only the four allowed
 * fields are included — any extra properties from the input are stripped.
 *
 * This is a defense-in-depth measure; the service layer already whitelists.
 */
export function buildCredentialPutBody(input: {
  credentialRef: string;
  enabled: boolean;
  environmentPolicy: "non_prod_only" | "all_environments";
  confirmAllEnvironments?: boolean;
}): {
  credentialRef: string;
  enabled: boolean;
  environmentPolicy: "non_prod_only" | "all_environments";
  confirmAllEnvironments?: boolean;
} {
  const body: Record<string, unknown> = {
    credentialRef: input.credentialRef,
    enabled: input.enabled,
    environmentPolicy: input.environmentPolicy,
  };
  if (input.confirmAllEnvironments !== undefined) {
    body.confirmAllEnvironments = input.confirmAllEnvironments;
  }
  return body as ReturnType<typeof buildCredentialPutBody>;
}
