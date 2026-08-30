// input: Next search params, environment slug resolver, page header, environment topology content
// output: canonical fail-closed environment topology route with a validated backend root ID
// pos: console topology entry point
// note: if this file changes, update this header and app/(console)/README.md.
import { getTranslations } from "next-intl/server";

import { EnvironmentTopologyContent } from "@/components/blocks/environment-topology-content";
import { PageHeader } from "@/components/blocks/page-header";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parsePositiveDecimalInteger } from "@/lib/list-page-search-params";

export default async function TopologyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("topology");
  const params = await searchParams;
  const scope = await resolveEnvironmentSlugToId<{
    environmentSlug?: string;
    environmentId?: number;
  }>({
    environmentSlug: Array.isArray(params.environment)
      ? params.environment[0]
      : params.environment,
  });
  const rootResourceId = parsePositiveDecimalInteger(params.rootId);

  return (
    <div className="space-y-6">
      <PageHeader title={t("environmentTitle")} description={t("environmentDescription")} />
      <EnvironmentTopologyContent
        environmentId={typeof scope?.environmentId === "number" ? scope.environmentId : null}
        rootResourceId={rootResourceId}
      />
    </div>
  );
}
