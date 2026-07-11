"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Settings, TriangleAlert } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  credentialStateLabel,
  missingFieldLabel,
  readinessLabelKey,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";
import { useAdminRole } from "@/lib/auth-role";

type QueryGovernancePanelProps = {
  target: QueryTarget;
};

function derivePrimaryBlocker(
  t: (key: string) => string,
  target: QueryTarget,
): string | null {
  if (target.readiness !== "ready") {
    return t(readinessLabelKey(target.readiness));
  }
  if (target.missingFields.length > 0) {
    return missingFieldLabel(t, target.missingFields[0]);
  }
  return null;
}

export function QueryGovernancePanel({ target }: QueryGovernancePanelProps) {
  const t = useTranslations("queryWorkbench");
  const { governance } = target;
  const blocker = derivePrimaryBlocker(t, target);

  return (
    <TooltipProvider>
      <section
        aria-label={t("governance.title")}
        className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2"
      >
        {blocker && (
          <Badge
            variant="outline"
            className="gap-1.5 border-rose-500/30 text-rose-700 dark:text-rose-300"
          >
            <TriangleAlert className="size-3" aria-hidden />
            <span className="sr-only">{t("governance.blocker")}</span>
            {blocker}
          </Badge>
        )}

        <Badge variant="outline" className="text-xs">
          <span className="sr-only">{t("governance.credentialStateLabel")}</span>
          {credentialStateLabel(t, governance.credentialState)}
        </Badge>
        <CredentialStatusSection />

        <Dialog>
          <DialogTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`${t("governance.title")} ${t("governance.details")}`}
              />
            }
          >
            {t("governance.details")}
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("governance.title")}</DialogTitle>
            </DialogHeader>
            {target.readiness === "missing_connection" && target.missingFields.length > 0 && (
              <section>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t("governance.missingFields")}
                </h3>
                <ul className="flex flex-wrap gap-1.5">
                  {target.missingFields.map((field) => (
                    <li
                      key={field}
                      className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300"
                    >
                      {missingFieldLabel(t, field)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t("governance.policyChecklist")}
              </h3>
              <PolicyBadges />
            </section>
          </DialogContent>
        </Dialog>
      </section>
    </TooltipProvider>
  );
}

/**
 * Compact policy badges. Shows blocked policies as red, future as amber,
 * and out-of-scope as secondary. Click/hover for full policy name.
 */
function PolicyBadges() {
  const t = useTranslations("queryWorkbench");

  const policies: { labelKey: string; valueKey: string; tone: "red" | "amber" | "secondary" }[] = [
    { labelKey: "policy.multiStatement", valueKey: "policy.blocked", tone: "red" },
    { labelKey: "policy.ddlDml", valueKey: "policy.blocked", tone: "red" },
    { labelKey: "policy.maxRows", valueKey: "policy.future", tone: "amber" },
    { labelKey: "policy.timeout", valueKey: "policy.future", tone: "amber" },
    { labelKey: "policy.exportPolicy", valueKey: "policy.notAvailable", tone: "secondary" },
    { labelKey: "policy.adminMode", valueKey: "policy.notInScope", tone: "secondary" },
    { labelKey: "policy.batchQuery", valueKey: "policy.future", tone: "amber" },
  ];

  return (
    <div className="flex flex-wrap gap-1.5">
      {policies.map((policy) => (
        <Tooltip key={policy.labelKey}>
          <TooltipTrigger
            render={
              <Badge
                variant={policy.tone === "secondary" ? "secondary" : "outline"}
                className={cn(
                  "text-xs",
                  policy.tone === "red" && "border-rose-500/30 text-rose-700 dark:text-rose-300",
                  policy.tone === "amber" && "border-amber-500/30 text-amber-700 dark:text-amber-300",
                )}
              />
            }
          >
            {t(policy.labelKey)}
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t(policy.valueKey)}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

/**
 * Phase 38A: Read-only credential status section for the governance panel.
 * Shows either an admin settings link or a contact administrator message.
 * Never renders credential edit controls. Compact inline layout.
 *
 * Uses the shared `useAdminRole` hook which reads sessionStorage first,
 * then falls back to decoding the bearer token payload.
 */
function CredentialStatusSection() {
  const tCred = useTranslations("queryCredentialSettings");
  const isAdmin = useAdminRole();

  if (isAdmin === null) {
    return <span className="text-xs text-muted-foreground" aria-hidden>&nbsp;</span>;
  }

  if (isAdmin) {
    return (
      <a
        href="/settings/query-credentials"
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <Settings className="size-3" aria-hidden />
        {tCred("workbench.adminLink")}
        <ExternalLink className="size-3" aria-hidden />
      </a>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">
      {tCred("workbench.credentialManagedByAdmin")}
    </span>
  );
}
