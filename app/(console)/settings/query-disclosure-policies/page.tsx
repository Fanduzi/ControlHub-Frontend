import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { QueryDisclosureSettings } from "@/components/settings/query-disclosure-settings";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parsePositiveDecimalInteger } from "@/lib/list-page-search-params";
import { getQueryTargets } from "@/services/query-targets";

export default async function QueryDisclosurePoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const resolved = await searchParams;
  const scope = await resolveEnvironmentSlugToId({
    environmentId: parsePositiveDecimalInteger(resolved.environmentId),
    environmentSlug: Array.isArray(resolved.environment) ? resolved.environment[0] : resolved.environment,
  });
  const environmentId = typeof scope?.environmentId === "number" ? scope.environmentId : undefined;
  const targetResponse = scope
    ? await getQueryTargets({
        page: 1,
        pageSize: 25,
        ...(environmentId !== undefined && { environmentId }),
      })
    : { items: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("queryDisclosureSettings.eyebrow")}
        title={t("queryDisclosureSettings.title")}
        description={t("queryDisclosureSettings.description")}
      />
      <QueryDisclosureSettings targets={targetResponse.items} />
    </div>
  );
}
