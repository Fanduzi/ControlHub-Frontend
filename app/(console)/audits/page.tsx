import { getTranslations } from "next-intl/server";

import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { AuditTable } from "@/components/audits/audit-table";
import {
  listAuditEventViewModels,
  listRecentAuditEventViewModels,
} from "@/lib/view-models";

export default async function AuditsPage() {
  const t = await getTranslations();
  const [events, recentEvents] = await Promise.all([
    listAuditEventViewModels(),
    listRecentAuditEventViewModels(4),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.audits.eyebrow")}
        title={t("pages.audits.title")}
        description={t("pages.audits.description")}
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <AuditTable events={events} />
        <DetailPanel
          title={t("pages.audits.latest.title")}
          description={t("pages.audits.latest.description")}
        >
          <ActivityTimeline events={recentEvents} />
        </DetailPanel>
      </div>
    </div>
  );
}
