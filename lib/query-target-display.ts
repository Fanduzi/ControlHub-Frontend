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

/**
 * Structured host/port display so the UI never renders a degenerate `:0` or
 * `:port` for missing_connection targets. Pure — takes no translator; the
 * caller resolves the incomplete case to a localized label.
 */
export type HostPortDisplay =
  | { kind: "complete"; value: string }
  | { kind: "hostOnly"; value: string }
  | { kind: "incomplete" };

export function describeHostPort(host: string, port: number): HostPortDisplay {
  const trimmedHost = (host ?? "").trim();
  const hasHost = trimmedHost !== "";
  const hasPort = typeof port === "number" && port > 0;

  if (hasHost && hasPort) {
    return { kind: "complete", value: `${trimmedHost}:${port}` };
  }
  if (hasHost) {
    return { kind: "hostOnly", value: trimmedHost };
  }
  return { kind: "incomplete" };
}

/**
 * Render a host/port label, falling back to the supplied localized label when
 * connection metadata is incomplete. The caller passes the translated label so
 * this helper stays pure (no translation hook).
 */
export function formatHostPortLabel(
  host: string,
  port: number,
  incompleteLabel: string,
): string {
  const display = describeHostPort(host, port);
  return display.kind === "incomplete" ? incompleteLabel : display.value;
}

/**
 * Known backend credentialState values. Phase 36A always returns
 * missing_readonly_credential; the rest are documented for future phases.
 * Unknown values fall back to a humanized raw string.
 */
export const KNOWN_CREDENTIAL_STATES = new Set<string>([
  "missing_readonly_credential",
  "configured_readonly_credential",
  "not_required",
  "unknown",
]);

/** Known backend missingFields values. */
export const KNOWN_MISSING_FIELDS = new Set<string>([
  "engine",
  "host",
  "port",
  "readonlyCredential",
]);

/**
 * Known backend safetyState values. A ready target reports
 * `readonly_sandbox_enabled` (Phase 37); the rest are the Phase 36
 * non-executable states. Unknown values fall back to a humanized raw string.
 */
export const KNOWN_SAFETY_STATES = new Set<string>([
  "credential_missing",
  "execution_disabled",
  "unsupported_engine",
  "connection_incomplete",
  "readonly_sandbox_enabled",
]);

/** i18n key (under queryWorkbench) for a known credentialState, or null. */
export function credentialStateLabelKey(state: string): string | null {
  return KNOWN_CREDENTIAL_STATES.has(state) ? `credentialStateValues.${state}` : null;
}

/** i18n key (under queryWorkbench) for a known missingField, or null. */
export function missingFieldLabelKey(field: string): string | null {
  return KNOWN_MISSING_FIELDS.has(field) ? `missingFieldValues.${field}` : null;
}

/** i18n key (under queryWorkbench) for a known safetyState, or null. */
export function safetyStateLabelKey(state: string): string | null {
  return KNOWN_SAFETY_STATES.has(state) ? `safetyStateValues.${state}` : null;
}

/** Translator shaped like next-intl's namespaced `t`. */
type Translator = (key: string) => string;

/**
 * Resolve a credentialState to a localized label, humanizing unknown values.
 * Centralizes the fallback so raw enums never leak to the UI.
 */
export function credentialStateLabel(t: Translator, state: string): string {
  const key = credentialStateLabelKey(state);
  return key ? t(key) : state.replaceAll("_", " ");
}

/**
 * Resolve a missingField to a localized label, falling back to the raw field.
 * Centralizes the fallback so raw field keys never leak to the UI.
 */
export function missingFieldLabel(t: Translator, field: string): string {
  const key = missingFieldLabelKey(field);
  return key ? t(key) : field;
}

/**
 * Resolve a safetyState to a localized label, humanizing unknown values.
 * Centralizes the fallback so raw enums (including the ready
 * `readonly_sandbox_enabled`) never leak to the UI.
 */
export function safetyStateLabel(t: Translator, state: string): string {
  const key = safetyStateLabelKey(state);
  return key ? t(key) : state.replaceAll("_", " ");
}

/** i18n key (under the queryWorkbench namespace) for a readiness label. */
export function readinessLabelKey(readiness: QueryTargetReadiness): string {
  return `readinessValues.${readiness}`;
}

/** i18n key (under the queryWorkbench namespace) for a query-kind label. */
export function queryKindLabelKey(kind: QueryKind): string {
  return `queryKindValues.${kind}`;
}
