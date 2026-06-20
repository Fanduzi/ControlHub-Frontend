import {
  EMPTY_FILTERS,
  type WorkbenchFilters,
} from "@/lib/query-target-display";

type RawSearchParams = Record<string, string | string[] | undefined>;

type PageSearchParamsProp = Promise<RawSearchParams>;

function readFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Parse the Query Workbench filter search params into immutable workbench
 * filter state. Used to deep-link initial filters (e.g. `/query?engine=mysql`).
 */
export async function parseQueryWorkbenchSearchParams(
  searchParams: PageSearchParamsProp,
): Promise<WorkbenchFilters> {
  const resolved = await searchParams;

  return {
    ...EMPTY_FILTERS,
    q: readFirst(resolved.q)?.trim() ?? "",
    engine: readFirst(resolved.engine)?.trim() ?? "",
    queryKind: readFirst(resolved.queryKind)?.trim() ?? "",
    readiness: readFirst(resolved.readiness)?.trim() ?? "",
  };
}
