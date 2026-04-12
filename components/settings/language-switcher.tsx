"use client";

import { startTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  LOCALE_COOKIE_NAME,
  isAppLocale,
} from "@/i18n/locales";
import { cn } from "@/lib/utils";

const LOCALE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const localeOptions = [
  { value: "zh-CN", label: "中" },
  { value: "en", label: "EN" },
] as const;

function persistLocale(nextLocale: string) {
  document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=${LOCALE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function LanguageSwitcher() {
  const t = useTranslations("controls.language");
  const locale = useLocale();
  const router = useRouter();
  const value = isAppLocale(locale) ? locale : "zh-CN";

  function handleLocaleChange(nextLocale: string) {
    if (!isAppLocale(nextLocale) || nextLocale === value) {
      return;
    }

    persistLocale(nextLocale);
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div
      aria-label={t("label")}
      className="flex items-center rounded-lg border border-border bg-card p-0.5"
      role="group"
    >
      {localeOptions.map((option) => {
        const active = option.value === value;

        return (
          <Button
            key={option.value}
            aria-label={option.label}
            aria-pressed={active}
            className={cn(
              "h-8 min-w-10 rounded-md border-transparent px-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.16em]",
              active
                ? "bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => handleLocaleChange(option.value)}
            size="sm"
            variant="ghost"
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
