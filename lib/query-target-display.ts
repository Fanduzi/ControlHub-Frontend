import type {
  QueryKind,
  QueryTarget,
  QueryTargetReadiness,
} from "@/types/query-target";

/**
 * Client-side filter state for the Query Workbench. Query kind and readiness
 * are derived by the backend and filtered on the client; engine and q are
 * convenience filters over the already-fetched target list.
 */
export type WorkbenchFilters = {
  q: string;
  engine: string;
  queryKind: string;
  readiness: string;
};

export const EMPTY_FILTERS: WorkbenchFilters = {
  q: "",
  engine: "",
  queryKind: "",
  readiness: "",
};

/** Closed option sets for the filter dropdowns. */
export const QUERY_KIND_OPTIONS: QueryKind[] = [
  "sql",
  "redis",
  "mongo",
  "unsupported",
];

export const READINESS_OPTIONS: QueryTargetReadiness[] = [
  "ready",
  "missing_connection",
  "credential_required",
  "unsupported_engine",
  "disabled",
];

/** Sentinel used by filter selects to represent "no filter". */
export const ALL_FILTER_VALUE = "all";

export function isAllFilter(value: string): boolean {
  return value === "" || value === ALL_FILTER_VALUE;
}

/**
 * Apply the workbench filters to a target list. Pure and immutable — returns a
 * new array, never mutates the input.
 */
export function filterTargets(
  targets: QueryTarget[],
  filters: WorkbenchFilters,
): QueryTarget[] {
  const q = filters.q.trim().toLowerCase();

  return targets.filter((target) => {
    if (
      !isAllFilter(filters.engine) &&
      target.connectionContext.engine.toLowerCase() !== filters.engine.toLowerCase()
    ) {
      return false;
    }

    if (!isAllFilter(filters.queryKind) && target.capability.queryKind !== filters.queryKind) {
      return false;
    }

    if (!isAllFilter(filters.readiness) && target.readiness !== filters.readiness) {
      return false;
    }

    if (q) {
      const haystack = [
        target.displayName,
        target.resourceName,
        target.connectionContext.engine,
        target.connectionContext.host,
        target.connectionContext.owner,
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) {
        return false;
      }
    }

    return true;
  });
}

/** Unique, sorted engine strings present in the target list. */
export function collectEngines(targets: QueryTarget[]): string[] {
  return [...new Set(targets.map((target) => target.connectionContext.engine))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function formatHostPort(host: string, port: number): string {
  return `${host}:${port}`;
}

/** i18n key (under the queryWorkbench namespace) for a readiness label. */
export function readinessLabelKey(readiness: QueryTargetReadiness): string {
  return `readinessValues.${readiness}`;
}

/** i18n key (under the queryWorkbench namespace) for a query-kind label. */
export function queryKindLabelKey(kind: QueryKind): string {
  return `queryKindValues.${kind}`;
}
