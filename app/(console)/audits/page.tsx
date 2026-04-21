import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { AuditTable } from "@/components/audits/audit-table";
import { parseAuditListSearchParams } from "@/lib/list-page-search-params";
import { listAuditEventViewModels } from "@/lib/view-models";

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const params = await parseAuditListSearchParams(searchParams);
  const { items: events, pageInfo } = await listAuditEventViewModels(params);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.audits.eyebrow")}
        title={t("pages.audits.title")}
        description={t("pages.audits.description")}
      />
      <AuditTable events={events} pageInfo={pageInfo} />
    </div>
  );
}
