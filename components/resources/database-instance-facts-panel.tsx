"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { cn } from "@/lib/utils";
import type {
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

function Fact({
  label,
  value,
  href,
  missing,
}: {
  label: string;
  value?: string;
  href?: string;
  missing: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      {value && href ? (
        <Link href={href} className="mt-1 block text-sm font-medium text-primary hover:underline">
          {value}
        </Link>
      ) : (
        <p className="mt-1 text-sm font-medium text-foreground">
          {value || missing}
        </p>
      )}
    </div>
  );
}

export function DatabaseInstanceFactsPanel({
  result,
}: {
  result: InstanceConsistencyResult;
}) {
  const t = useTranslations("databaseReadonlyIA");
  const tc = useTranslations("databaseConsistency");

  return (
    <DetailPanel
      title={t("instanceFacts.title")}
      description={t("instanceFacts.description")}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-consistency-status={result.status}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold",
              statusTone[result.status],
            )}
          >
            {tc(`status.${result.status}`)}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <Fact
            label={t("instanceFacts.parentCluster")}
            value={result.facts.parentClusterName}
            href={result.facts.parentClusterId ? `/resources/${result.facts.parentClusterId}` : undefined}
            missing={t("instanceFacts.parentClusterMissing")}
          />
          <Fact
            label={t("instanceFacts.role")}
            value={result.facts.role}
            missing={t("instanceFacts.missing")}
          />
          <Fact
            label={t("instanceFacts.connection")}
            value={result.facts.connection}
            missing={t("instanceFacts.missing")}
          />
          <Fact
            label={t("instanceFacts.topology")}
            value={
              result.issues.some(
                (issue) => issue.id === "instance-missing-from-topology",
              )
                ? t("instanceFacts.topologyMissing")
                : t("instanceFacts.topologyPresent")
            }
            missing={t("instanceFacts.missing")}
          />
        </div>

        {result.issues.length > 0 ? (
          <ul className="space-y-2">
            {result.issues.map((issue) => (
              <li
                key={issue.id}
                data-consistency-issue-kind={issue.kind}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <span className="font-medium text-foreground">
                  {issue.resourceName ?? issue.resourceId ?? ""}
                </span>
                <span className="ml-2 text-muted-foreground">
                  {tc(localKey(issue.messageKey))}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </DetailPanel>
  );
}
