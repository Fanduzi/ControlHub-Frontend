"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LOCALE_COOKIE_NAME,
  LOCALES,
  type AppLocale,
  isAppLocale,
} from "@/i18n/locales";

const LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function LanguageSwitcher() {
  const t = useTranslations("controls.language");
  const locale = useLocale();
  const router = useRouter();
  const value = isAppLocale(locale) ? locale : "zh-CN";

  function handleLocaleChange(nextLocale: string | null) {
    if (!nextLocale || !isAppLocale(nextLocale)) {
      return;
    }

    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=${LOCALE_MAX_AGE_SECONDS}; SameSite=Lax`;
    router.refresh();
  }

  return (
    <Select value={value} onValueChange={handleLocaleChange}>
      <SelectTrigger
        aria-label={t("label")}
        className="h-9 w-[116px] border-border bg-card text-sm"
      >
        <SelectValue placeholder={t("label")} />
      </SelectTrigger>
      <SelectContent>
        {LOCALES.map((option) => (
          <SelectItem key={option} value={option}>
            {t(`options.${option as AppLocale}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
