"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { StatusBadge } from "@/components/blocks/status-badge";
import {
  buildClusterMemberSummary,
  buildDecisionDeckMode,
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

function CompactHealthDeck({
  resource,
  members,
  recentAudits,
}: DatabaseDecisionDeckProps) {
  const td = useTranslations("databaseDecisionDeck");
  const to = useTranslations("databaseOperator");
  const isCluster = resource.resourceType === "database_cluster";

  const summary = isCluster
    ? buildClusterMemberSummary(members)
    : null;

  const auditCount = recentAudits.length;
  const hasConnection =
    resource.profileSummary?.hostname &&
    resource.profileSummary?.port != null;

  return (
    <section
      data-slot="database-decision-deck"
      data-testid="database-compact-health-deck"
      className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            {to("verdict.healthy")}
          </span>
          {isCluster && summary ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {td("compact.membersNormal", { count: summary.total })}
              </span>
            </>
          ) : null}
          {!isCluster && resource.profileSummary?.role ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {resource.profileSummary.role}
              </span>
            </>
          ) : null}
          {!isCluster && hasConnection ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs text-muted-foreground">
                {resource.profileSummary!.hostname}:{resource.profileSummary!.port}
              </span>
            </>
          ) : null}
          {!isCluster && resource.clusterInfo ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {td("compact.parentClusterNormal")}
              </span>
            </>
          ) : null}
          {auditCount > 0 ? (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {td("compact.recentAudits", { count: auditCount })}
              </span>
            </>
          ) : (
            <>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {td("compact.noRecentChanges")}
              </span>
            </>
          )}
        </div>
        <Link
          href={`/resources/${resource.id}?topologyDepth=2&topologyExpanded=1`}
          className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
        >
          {td("compact.viewTopology")}
        </Link>
      </div>
    </section>
  );
}

function DiagnosticDeck({
  resource,
  members,
  recentAudits,
}: DatabaseDecisionDeckProps) {
  const td = useTranslations("databaseDecisionDeck");
  const to = useTranslations("databaseOperator");

  const verdict = buildClusterMemberSummary(members);
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

  const verdictLevel = (() => {
    if (resource.healthStatus === "critical") return "critical";
    if (resource.healthStatus === "warning") return "needs_attention";
    if (resource.healthStatus === "unknown") return "unknown";
    if (
      abnormalMembers.length > 0 ||
      verdict.warningOrCritical > 0 ||
      verdict.stoppedOrDegraded > 0
    ) {
      return "needs_attention";
    }
    return "healthy";
  })();

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
          data-verdict-level={verdictLevel}
          className={cn(
            "rounded-md px-3 py-2 text-sm font-semibold",
            verdictTone[verdictLevel],
          )}
        >
          {to(`verdict.${verdictLevel}`)}
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
                        "Role not available"}
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
                      View topology
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

export function DatabaseDecisionDeck(props: DatabaseDecisionDeckProps) {
  const mode = buildDecisionDeckMode({
    resource: props.resource,
    members: props.members,
    recentAudits: props.recentAudits,
  });

  if (mode === "compact_healthy") {
    return <CompactHealthDeck {...props} />;
  }

  return <DiagnosticDeck {...props} />;
}
