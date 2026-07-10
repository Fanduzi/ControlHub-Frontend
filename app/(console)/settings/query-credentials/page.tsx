import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { QueryCredentialSettings } from "@/components/settings/query-credential-settings";
import { getQueryTargets } from "@/services/query-targets";

export default async function QueryCredentialsPage() {
  const t = await getTranslations();
  const targetResponse = await getQueryTargets({ page: 1, pageSize: 25 });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("queryCredentialSettings.eyebrow")}
        title={t("queryCredentialSettings.title")}
        description={t("queryCredentialSettings.description")}
      />
      <QueryCredentialSettings
        targets={targetResponse.items}
        pageInfo={targetResponse.pageInfo}
      />
    </div>
  );
}
