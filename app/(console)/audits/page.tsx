import { ActivityTimeline } from "@/components/blocks/activity-timeline";
import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { AuditTable } from "@/components/audits/audit-table";
import {
  listAuditEventViewModels,
  listRecentAuditEventViewModels,
} from "@/lib/view-models";

export default async function AuditsPage() {
  const [events, recentEvents] = await Promise.all([
    listAuditEventViewModels(),
    listRecentAuditEventViewModels(4),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Audits"
        title="Baseline audit events"
        description="Audit records capture manual maintenance activity so resource history stays visible before workflow automation arrives."
      />

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <AuditTable events={events} />
        <DetailPanel
          title="Latest changes"
          description="Compact timeline for recent ownership, relation, and metadata changes."
        >
          <ActivityTimeline events={recentEvents} />
        </DetailPanel>
      </div>
    </div>
  );
}
