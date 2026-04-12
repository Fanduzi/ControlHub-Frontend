"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Palette } from "lucide-react";
import { useTranslations } from "next-intl";

import { useAccent } from "@/components/providers/accent-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCENTS, type AccentName } from "@/lib/preferences";

const accentSwatchClassNames: Record<AccentName, string> = {
  blue: "bg-[oklch(0.53_0.12_241.34)]",
  purple: "bg-[oklch(0.58_0.17_300.43)]",
  emerald: "bg-[oklch(0.62_0.14_166.84)]",
  amber: "bg-[oklch(0.71_0.15_74.83)]",
};

type AccentSwitcherProps = {
  variant?: "menu" | "inline";
};

export function AccentSwitcher({
  variant = "menu",
}: AccentSwitcherProps = {}) {
  const t = useTranslations("controls.accent");
  const { accent, setAccent } = useAccent();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  if (variant === "inline") {
    return (
      <div
        aria-label={t("label")}
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        role="group"
      >
        {ACCENTS.map((option) => {
          const selected = option === accent;

          return (
            <Button
              key={option}
              variant="outline"
              className={cn(
                "h-10 justify-start gap-2 px-3",
                selected && "border-primary/40 bg-primary/10 text-foreground",
              )}
              onClick={() => setAccent(option)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 rounded-full ring-1 ring-border/80",
                  accentSwatchClassNames[option],
                )}
              />
              <span>{t(`options.${option}`)}</span>
              {selected ? <Check className="ml-auto size-4 text-primary" /> : null}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={t("label")}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative"
        title={t("label")}
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <Palette className="size-3.5 text-muted-foreground" />
        <span
          aria-hidden="true"
          className={cn(
            "absolute right-1.5 bottom-1.5 size-2 rounded-full ring-1 ring-background",
            accentSwatchClassNames[accent],
          )}
        />
      </Button>

      {open ? (
        <div
          aria-label={t("label")}
          className="absolute top-[calc(100%+0.375rem)] right-0 z-50 w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
          role="menu"
        >
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            {t("label")}
          </p>
          {ACCENTS.map((option) => (
            <button
              key={option}
              aria-checked={option === accent}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => {
                setAccent(option);
                setOpen(false);
              }}
              role="menuitemradio"
              type="button"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-2.5 rounded-full ring-1 ring-border/80",
                  accentSwatchClassNames[option],
                )}
              />
              <span>{t(`options.${option}`)}</span>
              {option === accent ? (
                <Check className="ml-auto size-4 text-primary" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
