// input: resource health freshness, observation metadata, locale, and formatting helpers
// output: compact accessible freshness, observed-time, and observer readout
// pos: shared Issue 81 health evidence presentation for resource list and detail views
// note: if this file changes, update this header and module README.md.

import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime, formatLabel } from "@/lib/format";
import type { Resource } from "@/types/resource";

type HealthEvidenceProps = {
  resource: Partial<
    Pick<Resource, "healthFreshness" | "healthObservedAt" | "healthObserver">
  >;
  locale?: string;
};

export function HealthEvidence({ resource, locale }: HealthEvidenceProps) {
  const appLocale = locale && isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  const freshness = formatLabel(resource.healthFreshness ?? "never");
  const observedAt = resource.healthObservedAt
    ? formatDateTime(resource.healthObservedAt, appLocale)
    : "—";
  const observer = resource.healthObserver || "—";

  return (
    <span
      className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
      aria-label={`Health evidence: ${freshness}; observed ${observedAt}; observer ${observer}`}
    >
      <span>{freshness}</span>
      <span aria-hidden="true">·</span>
      {resource.healthObservedAt ? (
        <time dateTime={resource.healthObservedAt}>{observedAt}</time>
      ) : (
        <span>{observedAt}</span>
      )}
      <span aria-hidden="true">·</span>
      <span>{observer}</span>
    </span>
  );
}
