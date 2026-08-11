// input: next-intl, theme/accent providers, tooltip
// output: root client providers without EnvironmentProvider
// pos: app-wide providers; environments live under console layout
// note: if this file changes, update header and components/providers/README.md
"use client";

import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import { AccentProvider } from "@/components/providers/accent-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppLocale } from "@/i18n/locales";

type AppProvidersProps = {
  children: ReactNode;
  locale: AppLocale;
  messages: AbstractIntlMessages;
  timeZone: string;
};

export function AppProviders({
  children,
  locale,
  messages,
  timeZone,
}: AppProvidersProps) {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      timeZone={timeZone}
    >
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="controlhub.theme"
      >
        <AccentProvider>
          {/* EnvironmentProvider lives in the console layout only: the login
              page must not probe authenticated /environments (401 noise and
              false session-expired redirects under the BFF boundary). */}
          <TooltipProvider delay={300}>{children}</TooltipProvider>
        </AccentProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
