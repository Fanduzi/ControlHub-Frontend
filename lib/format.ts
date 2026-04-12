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

export function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (segment) => segment.toUpperCase());
}
