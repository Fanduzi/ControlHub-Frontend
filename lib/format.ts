import { DEFAULT_LOCALE, type AppLocale } from "@/i18n/locales";

export function formatDateTime(value: string, locale: AppLocale = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatShortDate(value: string, locale: AppLocale = DEFAULT_LOCALE) {
  return new Intl.DateTimeFormat(locale, {
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
