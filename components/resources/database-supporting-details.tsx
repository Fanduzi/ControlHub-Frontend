"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

export function DatabaseSupportingDetails({ children }: { children: ReactNode }) {
  const t = useTranslations("databaseReadonlyIA.supportingDetails");

  return (
    <section className="space-y-4" data-slot="database-supporting-details">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">{children}</div>
    </section>
  );
}
