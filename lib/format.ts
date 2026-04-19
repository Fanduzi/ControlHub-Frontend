import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locales";

function resolveLocale(locale?: AppLocale) {
  if (locale) {
    return locale;
  }

  if (typeof document !== "undefined") {
    return (document.documentElement.lang || DEFAULT_LOCALE) as AppLocale;
  }

  return DEFAULT_LOCALE;
}

export function formatDateTime(value: string, locale?: AppLocale) {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string, locale?: AppLocale) {
  return new Intl.DateTimeFormat(resolveLocale(locale), {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatRelativeDateTime(value: string | Date, locale?: AppLocale): string {
  const now = new Date();
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = now.getTime() - d.getTime();

  const isoString = typeof value === "string" ? value : value.toISOString();
  if (diffMs < 0) return formatDateTime(isoString, locale);

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 24) return `${Math.floor(diffHours)}h ago`;

  return formatDateTime(isoString, locale);
}

export function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
