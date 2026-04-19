/**
 * Localized fallback summary builder for resources without explicit
 * `resourceSummaries` i18n keys.
 *
 * Accepts a duck-typed translator with `(key: string) => string` and
 * `.has(key: string) => boolean` — compatible with next-intl's `t`
 * but carries no framework import.
 */

interface SummaryResource {
  resourceType?: string;
  resourceSubtype?: string;
  lifecycleStatus?: string;
}

interface Translator {
  (key: string): string;
  has: (key: string) => boolean;
}

export function buildLocalizedFallbackSummary(
  resource: SummaryResource,
  t: Translator,
): string {
  const parts: string[] = [];

  if (resource.resourceType) {
    const key = `topology.types.${resource.resourceType}`;
    parts.push(t.has(key) ? t(key) : resource.resourceType);
  }

  if (resource.resourceSubtype) {
    parts.push(resource.resourceSubtype);
  }

  if (resource.lifecycleStatus) {
    const key = `statusValues.${resource.lifecycleStatus}`;
    parts.push(t.has(key) ? t(key) : resource.lifecycleStatus);
  }

  return parts.length > 0 ? parts.join(" · ") : "";
}

export function localizeResourceType(
  type: string,
  t: Translator,
): string {
  const key = `topology.types.${type}`;
  return t.has(key) ? t(key) : type;
}
