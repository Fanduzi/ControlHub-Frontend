"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Settings } from "lucide-react";

import type { QueryTarget } from "@/types/query-target";
import {
  credentialStateLabel,
  formatHostPortLabel,
  missingFieldLabel,
} from "@/lib/query-target-display";
import { cn } from "@/lib/utils";

type QueryGovernancePanelProps = {
  target: QueryTarget;
};

export function QueryGovernancePanel({ target }: QueryGovernancePanelProps) {
  const t = useTranslations("queryWorkbench");
  const { governance, connectionContext, availableActions } = target;

  const facts: { key: string; label: string; value: string }[] = [
    { key: "engine", label: t("context.engine"), value: connectionContext.engine },
    {
      key: "hostPort",
      label: t("context.hostPort"),
      value: formatHostPortLabel(
        connectionContext.host,
        connectionContext.port,
        t("connection.incomplete"),
      ),
    },
    { key: "owner", label: t("context.owner"), value: connectionContext.owner },
    { key: "environment", label: t("context.environment"), value: connectionContext.environment },
  ];
  if (connectionContext.clusterName) {
    facts.push({ key: "cluster", label: t("context.cluster"), value: connectionContext.clusterName });
  }

  const actionRows: { key: keyof QueryTarget["availableActions"]; labelKey: string }[] = [
    { key: "run", labelKey: "actionState.run" },
    { key: "explain", labelKey: "actionState.explain" },
    { key: "export", labelKey: "actionState.export" },
    { key: "saveSheet", labelKey: "actionState.saveSheet" },
    { key: "requestAccess", labelKey: "actionState.requestAccess" },
  ];

  const policyRows: { labelKey: string; valueKey: string }[] = [
    { labelKey: "policy.multiStatement", valueKey: "policy.blocked" },
    { labelKey: "policy.ddlDml", valueKey: "policy.blocked" },
    { labelKey: "policy.maxRows", valueKey: "policy.future" },
    { labelKey: "policy.timeout", valueKey: "policy.future" },
    { labelKey: "policy.exportPolicy", valueKey: "policy.notAvailable" },
    { labelKey: "policy.adminMode", valueKey: "policy.notInScope" },
    { labelKey: "policy.batchQuery", valueKey: "policy.future" },
  ];

  return (
    <aside
      aria-label={t("governance.title")}
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 className="text-sm font-semibold text-foreground">{t("governance.title")}</h2>
      </div>

      <div className="space-y-2.5">
        <StatusCard tone="red" title={t("governance.executionTitle")} description={t("governance.executionDescription")} />
        <StatusCard tone="amber" title={t("governance.credentialTitle")} description={t("governance.credentialDescription")} />
        <StatusCard tone="blue" title={t("governance.auditTitle")} description={t("governance.auditDescription")} />
        <StatusCard tone="green" title={t("governance.jitTitle")} description={t("governance.jitDescription")} />
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("governance.targetFacts")}
        </h3>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {facts.map((fact) => (
            <div key={fact.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{fact.label}</dt>
              <dd className="truncate font-medium text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("governance.credentialStateLabel")}:{" "}
          {credentialStateLabel(t, governance.credentialState)}
        </p>

        {/* Phase 38A: read-only credential status and admin link */}
        <CredentialStatusSection credentialState={governance.credentialState} />
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("governance.missingFields")}
        </h3>
        {target.missingFields.length > 0 ? (
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
        ) : (
          <p className="text-sm text-muted-foreground">{t("governance.noMissingFields")}</p>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("governance.policyChecklist")}
        </h3>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {policyRows.map((row) => (
            <div key={row.labelKey} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
              <dd className="font-medium text-foreground">{t(row.valueKey)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t("governance.availableActions")}
        </h3>
        <dl className="divide-y divide-border rounded-lg border border-border">
          {actionRows.map((row) => (
            <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <dt className="text-muted-foreground">{t(row.labelKey)}</dt>
              <dd className="font-medium text-muted-foreground">
                {availableActions[row.key] ? t(row.labelKey) : t("actionState.locked")}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}

const toneDot: Record<StatusCardProps["tone"], string> = {
  red: "bg-rose-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  green: "bg-emerald-500",
};

type StatusCardProps = {
  tone: "red" | "amber" | "blue" | "green";
  title: string;
  description: string;
};

function StatusCard({ tone, title, description }: StatusCardProps) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className={cn("size-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
        {title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

/**
 * Phase 38A: Read-only credential status section for the governance panel.
 * Shows credential state and either an admin settings link or a contact
 * administrator message. Never renders credential edit controls.
 */
function CredentialStatusSection({ credentialState }: { credentialState: string }) {
  const tCred = useTranslations("queryCredentialSettings");
  const tWorkbench = useTranslations("queryWorkbench");
  const isAdmin =
    typeof window !== "undefined" &&
    window.sessionStorage.getItem("controlhub.role") === "admin";

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs text-muted-foreground">
        {tCred("workbench.statusLabel")}:{" "}
        {credentialStateLabel(tWorkbench, credentialState)}
      </p>
      {isAdmin ? (
        <a
          href="/settings/query-credentials"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          <Settings className="size-3" aria-hidden />
          {tCred("workbench.adminLink")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">
          {tCred("workbench.credentialManagedByAdmin")}
        </p>
      )}
    </div>
  );
}
