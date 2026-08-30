// input: explicit URL environment scope, environment provider fallback, topology panel, translations
// output: fail-closed explicit URL scope with provider fallback and URL-owned topology controls
// pos: dedicated topology route client content
// note: if this file changes, update this header and components/blocks/README.md.
"use client";

import { useTranslations } from "next-intl";

import { useEnvironment } from "@/components/providers/environment-provider";
import { Skeleton } from "@/components/ui/skeleton";

import { TopologyPanel } from "./topology-panel";

type EnvironmentTopologyContentProps = {
  environmentId?: number | null;
};

export function EnvironmentTopologyContent({
  environmentId,
}: EnvironmentTopologyContentProps) {
  const t = useTranslations();
  const { currentEnvironmentId, loading } = useEnvironment();
  const hasUrlEnvironment = environmentId !== undefined;
  const selectedEnvironmentId = hasUrlEnvironment
    ? environmentId
    : currentEnvironmentId;

  if (loading) return <Skeleton className="h-[500px] w-full rounded-lg" />;

  if (!selectedEnvironmentId) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
        {t("topology.selectEnvironment")}
      </div>
    );
  }

  return (
    <TopologyPanel
      environmentId={selectedEnvironmentId}
      urlSync
    />
  );
}
