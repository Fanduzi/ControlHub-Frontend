// input: URL search parameter records
// output: normalized resource and audit list request parameters
// pos: shared page URL parser for server-rendered list routes
// note: if this file changes, update header and lib/README.md

import type { AuditEventListParams } from "@/types/audit";
import type { ResourceListParams } from "@/types/resource";

type RawSearchParams = Record<string, string | string[] | undefined>;

type PageSearchParamsProp = Promise<RawSearchParams>;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const POSITIVE_INTEGER_PATTERN = /^[1-9]\d*$/;

function parseSafePositiveInt(raw: string) {
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readFirst(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function readAll(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter((v) => v.trim() !== "");
  }

  return value && value.trim() !== "" ? [value] : [];
}

function normalizeText(value: string | string[] | undefined) {
  const trimmed = readFirst(value)?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTextArray(value: string | string[] | undefined) {
  const values = readAll(value).map((v) => v.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizePositiveInt(
  value: string | string[] | undefined,
  fallback: number,
) {
  const raw = readFirst(value)?.trim() ?? "";
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return fallback;
  }

  return parseSafePositiveInt(raw) ?? fallback;
}

function normalizeOptionalPositiveInt(value: string | string[] | undefined) {
  const raw = readFirst(value)?.trim() ?? "";
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return undefined;
  }

  return parseSafePositiveInt(raw);
}

function toSingleOrArray(values: string[] | undefined): string | string[] | undefined {
  if (!values || values.length === 0) return undefined;
  return values.length === 1 ? values[0] : values;
}

export async function parseResourceListSearchParams(
  searchParams: PageSearchParamsProp,
): Promise<ResourceListParams> {
  const resolved = await searchParams;

  // Multi-select families: read all repeated values
  const resourceType = toSingleOrArray(normalizeTextArray(resolved.resourceType));
  const resourceSubtype = toSingleOrArray(normalizeTextArray(resolved.resourceSubtype));
  const lifecycleStatus = toSingleOrArray(normalizeTextArray(resolved.lifecycleStatus));
  const healthStatus = toSingleOrArray(normalizeTextArray(resolved.healthStatus));

  // Unified archive filter: maps a single URL param to API-level booleans.
  // Values: "all" (default, active only), "includeArchived", "archivedOnly".
  const archiveFilter = normalizeText(resolved.archiveFilter);
  const includeArchived =
    archiveFilter === "includeArchived" ? true : undefined;
  const archivedOnly =
    archiveFilter === "archivedOnly" ? true : undefined;

  return {
    page: normalizePositiveInt(resolved.page, DEFAULT_PAGE),
    pageSize: normalizePositiveInt(resolved.pageSize, DEFAULT_PAGE_SIZE),
    resourceType,
    resourceSubtype,
    environmentId: normalizeOptionalPositiveInt(resolved.environmentId),
    environmentSlug: normalizeText(resolved.environment),
    lifecycleStatus,
    healthStatus,
    q: normalizeText(resolved.q),
    includeArchived,
    archivedOnly,
  };
}

export async function parseAuditListSearchParams(
  searchParams: PageSearchParamsProp,
): Promise<AuditEventListParams> {
  const resolved = await searchParams;

  // Multi-select families for audits
  const eventType = toSingleOrArray(normalizeTextArray(resolved.eventType));
  const result = toSingleOrArray(normalizeTextArray(resolved.result));

  return {
    page: normalizePositiveInt(resolved.page, DEFAULT_PAGE),
    pageSize: normalizePositiveInt(resolved.pageSize, DEFAULT_PAGE_SIZE),
    targetResourceId: normalizeOptionalPositiveInt(resolved.targetResourceId),
    q: normalizeText(resolved.q),
    eventType,
    result,
  };
}
