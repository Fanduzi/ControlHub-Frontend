"use client";

import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { cn } from "@/lib/utils";
import type {
  ClusterConsistencyResult,
  ConsistencyStatus,
  InstanceConsistencyResult,
} from "@/lib/database-read-model-consistency";

const statusTone: Record<ConsistencyStatus, string> = {
  ok: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  unknown: "bg-muted text-muted-foreground",
};

function localKey(key: string): string {
  return key.replace("databaseConsistency.", "");
}

type DatabaseConsistencyPanelProps =
  | { scope: "cluster"; result: ClusterConsistencyResult }
  | { scope: "instance"; result: InstanceConsistencyResult };

export function DatabaseConsistencyPanel(props: DatabaseConsistencyPanelProps) {
  const t = useTranslations("databaseConsistency");
  const { scope } = props;
  const status = props.result.status;
  const issues = props.result.issues;

  return (
    <DetailPanel title={t("title")} description={t("description")}>
      <div className="space-y-3" data-consistency-scope={scope}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-consistency-status={status}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold",
              statusTone[status],
            )}
          >
            {t(`status.${status}`)}
          </span>
          {scope === "cluster" && (
            <span className="text-sm text-muted-foreground">
              {t("counts", (props.result as ClusterConsistencyResult).counts)}
            </span>
          )}
        </div>

        {issues.length > 0 ? (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li
                key={issue.id}
                data-consistency-issue-kind={issue.kind}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {issue.resourceName ?? issue.resourceId ?? ""}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {t(localKey(issue.messageKey))}
                </span>
              </li>
            ))}
          </ul>
        ) : scope === "instance" ? (
          <p className="text-sm text-muted-foreground">{t("instanceSummary")}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("allSignalsAgree")}</p>
        )}
      </div>
    </DetailPanel>
  );
}
