"use client";

import { useTranslations } from "next-intl";

import { DetailPanel } from "@/components/blocks/detail-panel";
import type { InstanceConsistencyResult } from "@/lib/database-read-model-consistency";

function Fact({ label, value, missingText }: { label: string; value?: string; missingText: string }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">
        {value || missingText}
      </p>
    </div>
  );
}

export function DatabaseInstanceContextPanel({
  result,
}: {
  result: InstanceConsistencyResult;
}) {
  const t = useTranslations("databaseConsistency");

  return (
    <DetailPanel
      title={t("instanceContext.title")}
      description={t("instanceContext.description")}
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Fact
          label={t("instanceContext.parentCluster")}
          value={result.facts.parentClusterName}
          missingText={t("instanceContext.missing")}
        />
        <Fact
          label={t("instanceContext.role")}
          value={result.facts.role}
          missingText={t("instanceContext.missing")}
        />
        <Fact
          label={t("instanceContext.connection")}
          value={result.facts.connection}
          missingText={t("instanceContext.missing")}
        />
      </div>
    </DetailPanel>
  );
}
