import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { QueryDisclosureSettings } from "@/components/settings/query-disclosure-settings";
import { getQueryTargets } from "@/services/query-targets";

export default async function QueryDisclosurePoliciesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const resolved = await searchParams;
  const environmentId = Number(Array.isArray(resolved.environmentId) ? resolved.environmentId[0] : resolved.environmentId);
  const targetResponse = await getQueryTargets({
    page: 1,
    pageSize: 25,
    ...(Number.isFinite(environmentId) && environmentId > 0 && { environmentId }),
  });

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
