"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { AuditEventViewModel, ResourceDetailViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

import { DetailPanel } from "@/components/blocks/detail-panel";
import {
  buildAuditContextSummary,
  buildClusterMemberSummary,
  buildDatabaseOperatorVerdict,
} from "@/lib/database-operator-workbench";
import { cn } from "@/lib/utils";

type DatabaseOperatorWorkbenchProps = {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  clusterInfo?: ResourceDetailViewModel["clusterInfo"];
  recentAudits?: AuditEventViewModel[];
};

const verdictColors: Record<string, string> = {
  healthy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  needs_attention: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  unknown: "bg-muted text-muted-foreground",
};

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          accent && value > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export function DatabaseOperatorWorkbench({
  resource,
  members,
  recentAudits,
}: DatabaseOperatorWorkbenchProps) {
  const t = useTranslations("databaseOperator");
  const td = useTranslations("diagnostics");

  const isCluster = resource.resourceType === "database_cluster";
  const verdict = buildDatabaseOperatorVerdict({ resource, members });
  const summary = isCluster ? buildClusterMemberSummary(members) : null;
  const auditContext = buildAuditContextSummary(recentAudits ?? []);

  const verdictLabel = t(`verdict.${verdict.level}`);

  return (
    <div className="space-y-4">
      <DetailPanel
        title={t("title")}
        description={t("description")}
      >
        <div className="space-y-4">
          <div
            data-verdict-level={verdict.level}
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold",
              verdictColors[verdict.level],
            )}
          >
            <span>{verdictLabel}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {verdict.facts.map((fact) => (
              <span
                key={fact}
                className="text-sm text-muted-foreground"
              >
                {t(`facts.${fact}`)}
              </span>
            ))}
          </div>
        </div>
      </DetailPanel>

      {isCluster && summary && (
        <DetailPanel
          title={t("memberSummary.title")}
          description={t("memberSummary.description")}
        >
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <SummaryCard label={t("memberSummary.total")} value={summary.total} />
            <SummaryCard label={t("memberSummary.primary")} value={summary.primary} />
            <SummaryCard label={t("memberSummary.replica")} value={summary.replica} />
            <SummaryCard label={t("memberSummary.roleUnknown")} value={summary.roleUnknown} />
            <SummaryCard
              label={t("memberSummary.warningOrCritical")}
              value={summary.warningOrCritical}
              accent
            />
            <SummaryCard
              label={t("memberSummary.stoppedOrDegraded")}
              value={summary.stoppedOrDegraded}
              accent
            />
          </div>
        </DetailPanel>
      )}

      <DetailPanel
        title={t("recentAudits.title")}
        description={t("recentAudits.description")}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {auditContext.summaryKey === "diagnostics.audit.recentEvents"
              ? td("audit.recentEvents", { count: auditContext.count })
              : td(auditContext.summaryKey)}
          </p>

          {recentAudits && recentAudits.length > 0 ? (
            <>
              {recentAudits.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm"
                >
                  <span className="font-medium text-foreground">
                    {event.eventType}
                  </span>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>{event.actorLabel}</span>
                    <span className="font-mono text-xs">{event.createdAt}</span>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <Link
                  href={`/audits?targetResourceId=${resource.id}`}
                  className="text-sm text-primary hover:underline"
                >
                  {td("audit.viewAll")}
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </DetailPanel>

      <div className="flex items-center gap-2">
        <Link
          href={`/resources/${resource.id}?topologyDepth=2&topologyExpanded=1`}
          className="text-sm font-medium text-primary hover:text-primary/80"
        >
          {t("topology.openExpanded")}
        </Link>
      </div>
    </div>
  );
}
