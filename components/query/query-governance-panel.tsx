"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ExternalLink, Info, Settings } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  credentialStateLabel,
  missingFieldLabel,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";

type QueryGovernancePanelProps = {
  target: QueryTarget;
};

export function QueryGovernancePanel({ target }: QueryGovernancePanelProps) {
  const t = useTranslations("queryWorkbench");
  const { governance, availableActions } = target;

  return (
    <TooltipProvider>
      <aside
        aria-label={t("governance.title")}
        className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t("governance.title")}</h2>
        </div>

        {/* Compact status badges with tooltip details */}
        <div className="flex flex-wrap gap-1.5">
          <StatusBadge
            tone="red"
            label={t("governance.executionTitle")}
            tooltip={t("governance.executionDescription")}
          />
          <StatusBadge
            tone="amber"
            label={t("governance.credentialTitle")}
            tooltip={t("governance.credentialDescription")}
          />
          <StatusBadge
            tone="blue"
            label={t("governance.auditTitle")}
            tooltip={t("governance.auditDescription")}
          />
          <StatusBadge
            tone="green"
            label={t("governance.jitTitle")}
            tooltip={t("governance.jitDescription")}
          />
        </div>

        {/* Credential status and admin link */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("governance.credentialStateLabel")}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {credentialStateLabel(t, governance.credentialState)}
            </Badge>
            <CredentialStatusSection />
          </div>
        </section>

        {/* Missing fields */}
        {target.missingFields.length > 0 && (
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

        {/* Policy checklist - compact badges */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("governance.policyChecklist")}
          </h3>
          <PolicyBadges />
        </section>

        {/* Available actions - compact badges with semantic tooltip */}
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t("governance.availableActions")}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {(
              ["run", "explain", "export", "saveSheet", "requestAccess"] as const
            ).map((key) => {
              const isAvailable = availableActions[key];
              const actionLabel = t(`actionState.${key}`);
              const stateLabel = isAvailable
                ? t("actionState.available")
                : t("actionState.locked");
              const semanticLabel = `${actionLabel} · ${stateLabel}`;
              return (
                <Tooltip key={key}>
                  <TooltipTrigger
                    render={
                      <Badge
                        variant={isAvailable ? "default" : "secondary"}
                        className="text-xs"
                        aria-label={semanticLabel}
                      />
                    }
                  >
                    {actionLabel}
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {semanticLabel}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </section>
      </aside>
    </TooltipProvider>
  );
}

const toneDot: Record<StatusBadgeProps["tone"], string> = {
  red: "bg-rose-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
};

type StatusBadgeProps = {
  tone: "red" | "amber" | "blue" | "green";
  label: string;
  tooltip: string;
};

/**
 * Compact status badge with a tooltip for the full description.
 * Replaces the large StatusCard to save vertical space.
 */
function StatusBadge({ tone, label, tooltip }: StatusBadgeProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="outline" className="gap-1.5 text-xs" />
        }
      >
        <span className={cn("size-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
        {label}
        <Info className="size-3 opacity-50" aria-hidden />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
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
 */
function CredentialStatusSection() {
  const tCred = useTranslations("queryCredentialSettings");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsAdmin(window.sessionStorage.getItem("controlhub.role") === "admin");
    } catch {
      setIsAdmin(false);
    }
  }, []);

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
