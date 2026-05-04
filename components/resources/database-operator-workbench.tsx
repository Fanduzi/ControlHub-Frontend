"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import type { AuditEventViewModel, ResourceDetailViewModel } from "@/types/view-models";
import type { ClusterMember } from "@/types/resource";

import { DetailPanel } from "@/components/blocks/detail-panel";
import {
  buildClusterMemberSummary,
  buildDecisionDeckMode,
} from "@/lib/database-operator-workbench";
import {
  buildAuditBuckets,
  buildDiagnosticEvidence,
} from "@/lib/database-diagnostic-runbook";
import { cn } from "@/lib/utils";

type DatabaseOperatorWorkbenchProps = {
  resource: ResourceDetailViewModel;
  members: ClusterMember[];
  clusterInfo?: ResourceDetailViewModel["clusterInfo"];
  recentAudits?: AuditEventViewModel[];
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
  const summary = isCluster ? buildClusterMemberSummary(members) : null;
  const diagnosticEvidence = buildDiagnosticEvidence({
    resource,
    members,
    recentAudits: recentAudits ?? [],
  });
  const auditBuckets = buildAuditBuckets(recentAudits ?? []);
  const deckMode = buildDecisionDeckMode({
    resource,
    members,
    recentAudits: recentAudits ?? [],
  });
  const showEvidencePanel = deckMode === "diagnostic";

  return (
    <div className="space-y-4">
      {showEvidencePanel ? (
        <DetailPanel
          title={t("evidence.collapsedTitle")}
          description={t("evidence.collapsedDescription", { count: diagnosticEvidence.length })}
        >
          <details data-testid="evidence-details">
            <summary className="cursor-pointer text-sm font-medium text-primary hover:text-primary/80">
              {t("evidence.collapsedSummary", { count: diagnosticEvidence.length })}
            </summary>
            <div className="mt-3 space-y-2">
              {diagnosticEvidence.length > 0 ? (
                diagnosticEvidence.map((item) => (
                  <div
                    key={item.id}
                    data-evidence-severity={item.severity}
                    className="rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {t(item.titleKey.replace("databaseOperator.", ""), { count: item.count })}
                      </p>
                      <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                        {t(item.sourceKey.replace("databaseOperator.", ""))}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {t("evidence.rawHint")}: {item.rawHint}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t("evidence.empty")}</p>
              )}
            </div>
          </details>
        </DetailPanel>
      ) : null}

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
        title={t("auditBuckets.title")}
        description={t("auditBuckets.description")}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {auditBuckets.total === 0
              ? t("auditBuckets.noEvents")
              : auditBuckets.hasPotentiallyRelevantChanges
                ? t("auditBuckets.relevantChanges", {
                    count: auditBuckets.resourceChanges + auditBuckets.relationChanges,
                  })
                : t("auditBuckets.noRelevantChanges")}
          </p>
          {auditBuckets.hasPotentiallyRelevantChanges ? (
            <p className="text-xs text-muted-foreground">
              {t("auditBuckets.causalityNotice")}
            </p>
          ) : null}

          {auditBuckets.total > 0 ? (
            <div className="flex justify-end">
              <Link
                href={`/audits?targetResourceId=${resource.id}`}
                className="text-sm text-primary hover:underline"
              >
                {t("auditBuckets.viewAuditHistory")}
              </Link>
            </div>
          ) : null}
        </div>
      </DetailPanel>
    </div>
  );
}
