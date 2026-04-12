"use client";

import { useTranslations } from "next-intl";

export default function ConsoleLoading() {
  const t = useTranslations("common");

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  );
}
