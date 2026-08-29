// input: authenticated browser session and localized machine-principal copy
// output: settings-page entry point for machine-principal administration
// pos: Admin-gated discoverability card for credential lifecycle management
// note: if this file changes, update this module's README.md.
"use client";

import Link from "next/link";
import { ExternalLink, Shield } from "lucide-react";
import { useLocale } from "next-intl";

import { useAdminRole } from "@/lib/auth-role";
import { getMachinePrincipalCopy } from "@/lib/machine-principal-copy";

export function MachinePrincipalEntry() {
  const isAdmin = useAdminRole();
  const copy = getMachinePrincipalCopy(useLocale());

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-4">
      <p className="font-medium text-foreground">{copy.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
      <div className="mt-4">
        {isAdmin === null ? <span className="text-sm text-muted-foreground" aria-hidden>&nbsp;</span> : isAdmin ? (
          <Link href="/settings/machine-principals" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground">
            {copy.manage}
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Shield className="size-3.5 shrink-0" aria-hidden />
            {copy.restricted}
          </p>
        )}
      </div>
    </div>
  );
}
