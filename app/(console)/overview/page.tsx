import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { OverviewContent } from "@/components/overview/overview-content";
import {
  listAttentionResourceViewModels,
  listRecentAuditEventViewModels,
  listResourceViewModels,
} from "@/lib/view-models";

export default async function OverviewPage() {
  const t = await getTranslations("pages.overview");
  const [attentionResources, resources, recentAudits] = await Promise.all([
    listAttentionResourceViewModels(),
    listResourceViewModels(),
    listRecentAuditEventViewModels(),
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
        recentAudits={recentAudits}
      />
    </div>
  );
}
