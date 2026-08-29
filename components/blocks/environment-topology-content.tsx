// input: environment provider, topology panel, translations
// output: current-environment topology surface with a controlled empty state
// pos: dedicated topology route client content
"use client";

import { useTranslations } from "next-intl";

import { useEnvironment } from "@/components/providers/environment-provider";
import { Skeleton } from "@/components/ui/skeleton";

import { TopologyPanel } from "./topology-panel";

export function EnvironmentTopologyContent() {
  const t = useTranslations();
  const { currentEnvironmentId, loading } = useEnvironment();

  if (loading) return <Skeleton className="h-[500px] w-full rounded-lg" />;

  if (!currentEnvironmentId) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
        {t("topology.selectEnvironment")}
      </div>
    );
  }

  return <TopologyPanel environmentId={currentEnvironmentId} />;
}
