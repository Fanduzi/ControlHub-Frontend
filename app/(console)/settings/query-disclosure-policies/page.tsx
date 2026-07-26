import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { QueryDisclosureSettings } from "@/components/settings/query-disclosure-settings";
import { getQueryTargets } from "@/services/query-targets";

export default async function QueryDisclosurePoliciesPage() {
  const t = await getTranslations();
  const targetResponse = await getQueryTargets({ page: 1, pageSize: 25 });

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
