"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ExternalLink, Shield } from "lucide-react";

import { useAdminRole } from "@/lib/auth-role";

/**
 * Settings page entry card for Query Disclosure Policy management.
 *
 * Admin users see a link to `/settings/query-disclosure-policies`.
 * Non-admin users see a "managed by administrators" message.
 * Hydration-safe: renders the same placeholder during SSR and
 * first client render.
 */
export function QueryDisclosureEntry() {
  const t = useTranslations("pages.settings.disclosurePolicies");
  const isAdmin = useAdminRole();

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-4">
      <p className="font-medium text-foreground">{t("title")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      <div className="mt-4">
        {isAdmin === null ? (
          // Hydration-safe placeholder — matches SSR output
          <span className="text-sm text-muted-foreground" aria-hidden>
            &nbsp;
          </span>
        ) : isAdmin ? (
          <Link
            href="/settings/query-disclosure-policies"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground"
          >
            {t("adminAction")}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Shield className="size-3.5 shrink-0" aria-hidden />
            {t("nonAdminCopy")}
          </p>
        )}
      </div>
    </div>
  );
}
