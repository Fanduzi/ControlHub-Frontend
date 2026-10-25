import { DEFAULT_LOCALE, isAppLocale } from "@/i18n/locales";
import { formatDateTime } from "@/lib/format";
import { useTranslations } from "next-intl";
import type { Resource } from "@/types/resource";

type HealthEvidenceProps = {
  resource: Partial<
    Pick<Resource, "healthFreshness" | "healthObservedAt" | "healthObserver" | "manualHealthOverride">
  >;
  locale?: string;
};

export function HealthEvidence({ resource, locale }: HealthEvidenceProps) {
  const t = useTranslations("common.healthEvidence");
  const appLocale = locale && isAppLocale(locale) ? locale : DEFAULT_LOCALE;
  const freshness = t(`freshness.${resource.healthFreshness ?? "never"}`);
  const observedAt = resource.healthObservedAt
    ? formatDateTime(resource.healthObservedAt, appLocale)
    : "—";
  const observer = resource.healthObserver || "—";
  const override = resource.manualHealthOverride
    ? t(`status.${resource.manualHealthOverride}`)
    : t("none");

  return (
    <span
      className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground"
      aria-label={t("ariaLabel", { freshness, observedAt, observer, override })}
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
      <span aria-hidden="true">·</span>
      <span>{t("manualOverride", { status: override })}</span>
    </span>
  );
}
