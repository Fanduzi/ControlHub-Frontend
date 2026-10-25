"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const { environments, currentEnvironmentId, loading } = useEnvironment();
  const hasUrlEnvironment = environmentId !== undefined;
  const selectedEnvironmentId = hasUrlEnvironment
    ? environmentId
    : currentEnvironmentId;

  if (loading) return <Skeleton className="h-[500px] w-full rounded-lg" />;

  if (!selectedEnvironmentId) {
    // The topology endpoint is single-environment only; "all" has no graph.
    // Offer the environments as explicit URL-scoped choices instead of a
    // passive placeholder.
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-10">
        <p className="text-center text-sm text-muted-foreground">
          {t("topology.selectEnvironment")}
        </p>
        <ul className="mx-auto mt-4 flex max-w-md flex-col gap-1">
          {environments.map((environment) => (
            <li key={environment.id}>
              <button
                type="button"
                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => router.push(`/topology?environment=${environment.slug}`)}
              >
                {environment.name}
              </button>
            </li>
          ))}
        </ul>
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
