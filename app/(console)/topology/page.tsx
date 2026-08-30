// input: Next search params, environment slug resolver, page header, environment topology content
// output: explicit fail-closed URL environment scope with provider fallback when the parameter is absent
// pos: console topology entry point
// note: if this file changes, update this header and app/(console)/README.md.
import { getTranslations } from "next-intl/server";

import { EnvironmentTopologyContent } from "@/components/blocks/environment-topology-content";
import { PageHeader } from "@/components/blocks/page-header";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";

export default async function TopologyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("topology");
  const params = await searchParams;
  const hasEnvironment = params.environment !== undefined;
  const scope = hasEnvironment
    ? await resolveEnvironmentSlugToId<{
        environmentSlug?: string;
        environmentId?: number;
      }>({
        environmentSlug: Array.isArray(params.environment)
          ? params.environment[0]
          : params.environment,
      })
    : undefined;

  return (
    <div className="space-y-6">
      <PageHeader title={t("environmentTitle")} description={t("environmentDescription")} />
      <EnvironmentTopologyContent
        environmentId={hasEnvironment
          ? (typeof scope?.environmentId === "number" ? scope.environmentId : null)
          : undefined}
      />
    </div>
  );
}
