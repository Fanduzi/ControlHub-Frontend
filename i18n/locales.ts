export const DEFAULT_LOCALE = "zh-CN";

export const LOCALES = ["zh-CN", "en"] as const;

export const LOCALE_COOKIE_NAME = "controlhub.locale";

export type AppLocale = (typeof LOCALES)[number];

export function isAppLocale(value: string): value is AppLocale {
  return LOCALES.includes(value as AppLocale);
}
