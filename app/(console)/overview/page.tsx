import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { OverviewContent } from "@/components/overview/overview-content";
import {
  listAllResourceViewModels,
  listAttentionResourceViewModels,
} from "@/lib/view-models";
import { ENVIRONMENT_STORAGE_KEY, parseEnvironmentId } from "@/lib/preferences";

export default async function OverviewPage() {
  const t = await getTranslations("pages.overview");
  const environmentId = parseEnvironmentId(
    (await cookies()).get(ENVIRONMENT_STORAGE_KEY)?.value,
  );
  const params = environmentId === null ? {} : { environmentId };
  const [attentionResources, resources] = await Promise.all([
    listAttentionResourceViewModels(params),
    listAllResourceViewModels(params),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />
      <OverviewContent
        resources={resources}
        attentionResources={attentionResources}
      />
    </div>
  );
}
