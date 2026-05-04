"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export function DatabaseSupportingDetails({
  primary,
  secondary,
  fullWidth,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  fullWidth: ReactNode;
}) {
  const t = useTranslations("databaseReadonlyIA.supportingDetails");

  return (
    <section className="space-y-4" data-slot="database-supporting-details">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div data-testid="database-supporting-primary">{primary}</div>
        <div data-testid="database-supporting-secondary">{secondary}</div>
        <div
          data-testid="database-supporting-full-width"
          className="xl:col-span-2"
        >
          {fullWidth}
        </div>
      </div>
    </section>
  );
}
