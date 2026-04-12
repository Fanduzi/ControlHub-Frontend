"use client";

import { useCallback, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

const cycle = ["light", "dark", "system"] as const;

type ThemeValue = (typeof cycle)[number];

const themeIcons: Record<ThemeValue, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const t = useTranslations("controls.theme");
  const { setTheme, theme = "system" } = useTheme();

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const resolvedTheme = theme ?? "system";
  const current: ThemeValue =
    mounted && cycle.includes(resolvedTheme as ThemeValue)
      ? (resolvedTheme as ThemeValue)
      : "system";
  const Icon = themeIcons[current];

  const handleToggle = useCallback(() => {
    const idx = cycle.indexOf(current as (typeof cycle)[number]);
    const next = cycle[(idx + 1) % cycle.length];
    setTheme(next);
  }, [current, setTheme]);

  return (
    <Button
      variant="outline"
      size="icon-sm"
      aria-label={`${t("label")}: ${t(`options.${current}`)}`}
      title={`${t("label")}: ${t(`options.${current}`)}`}
      onClick={handleToggle}
    >
      <Icon className="size-4" />
    </Button>
  );
}
