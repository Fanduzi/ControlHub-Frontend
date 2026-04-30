"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/blocks/status-badge";
import {
  buildDatabaseOperatorVerdict,
  sortClusterMembersForOperations,
} from "@/lib/database-operator-workbench";
import {
  buildDiagnosticEvidence,
  buildRunbookChecks,
} from "@/lib/database-diagnostic-runbook";
import { cn } from "@/lib/utils";
import type { ClusterMember } from "@/types/resource";
import type {
  AuditEventViewModel,
  ResourceDetailViewModel,
} from "@/types/view-models";

type DatabaseDecisionDeckProps = {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  recentAudits: AuditEventViewModel[];
};

const verdictTone: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  needs_attention: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  unknown: "bg-muted text-muted-foreground",
};

function isAbnormalMember(m: ClusterMember): boolean {
  return (
    m.healthStatus === "critical" ||
    m.healthStatus === "warning" ||
    m.healthStatus === "unknown" ||
    m.lifecycleStatus === "stopped" ||
    m.lifecycleStatus === "degraded"
  );
}

function localKey(key: string): string {
  return key.replace("databaseOperator.", "");
}

export function DatabaseDecisionDeck({
  resource,
  members,
  recentAudits,
}: DatabaseDecisionDeckProps) {
  const t = useTranslations();
  const td = useTranslations("databaseDecisionDeck");
  const to = useTranslations("databaseOperator");
  const diagnostics = useTranslations("diagnostics");

  const verdict = buildDatabaseOperatorVerdict({ resource, members });
  const allEvidence = buildDiagnosticEvidence({
    resource,
    members,
    recentAudits,
  });
  const evidence = allEvidence.slice(0, 3);
  const checks = buildRunbookChecks(allEvidence).slice(0, 3);
  const abnormalMembers = sortClusterMembersForOperations(members)
    .filter(isAbnormalMember)
    .slice(0, 3);
  const isCluster = resource.resourceType === "database_cluster";

  return (
    <section
      data-slot="database-decision-deck"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {td("title")}
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            {resource.displayName}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{resource.resourceSubtype}</span>
            <span>{resource.environmentName}</span>
            <StatusBadge status={resource.healthStatus} tone="health" />
            <StatusBadge status={resource.lifecycleStatus} tone="lifecycle" />
          </div>
        </div>
        <div
          data-verdict-level={verdict.level}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-semibold",
            verdictTone[verdict.level],
          )}
        >
          {to(`verdict.${verdict.level}`)}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-xl border border-border bg-background p-3">
          <h3 className="text-sm font-semibold">{td("topEvidence")}</h3>
          <div className="mt-3 space-y-2">
            {evidence.length > 0 ? (
              evidence.map((item) => (
                <div
                  key={item.id}
                  data-testid="decision-evidence-item"
                  data-evidence-severity={item.severity}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-foreground">
                      {to(localKey(item.titleKey), { count: item.count })}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {to(localKey(item.sourceKey))}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {to("evidence.rawHint")}: {item.rawHint}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {to("evidence.empty")}
              </p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-3">
          <h3 className="text-sm font-semibold">{td("nextChecks")}</h3>
          <ol className="mt-3 space-y-2">
            {checks.map((check, index) => (
              <li
                key={check.id}
                data-testid="decision-runbook-item"
                className="flex gap-2 text-sm text-muted-foreground"
              >
                <span className="font-mono text-xs text-primary">
                  {index + 1}.
                </span>
                <span>{to(localKey(check.textKey))}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold">{td("topologyTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {td("topologyDescription")}
            </p>
          </div>
          <Link
            href={`/resources/${resource.id}?topologyDepth=2&topologyExpanded=1`}
            className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            {td("openTopology")}
          </Link>
        </div>
      </div>

      {isCluster ? (
        <div className="mt-3 rounded-xl border border-border bg-background p-3">
          <h3 className="text-sm font-semibold">{td("abnormalMembers")}</h3>
          <div className="mt-3 space-y-2">
            {abnormalMembers.length > 0 ? (
              abnormalMembers.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {m.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.profileSummary?.role ??
                        diagnostics("missing.role")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={m.healthStatus} tone="health" />
                    <StatusBadge
                      status={m.lifecycleStatus}
                      tone="lifecycle"
                    />
                    <Link
                      href={`/resources/${m.id}?topologyDepth=2&topologyExpanded=1`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      {diagnostics("topology.viewTopology")}
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {td("noAbnormalMembers")}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
