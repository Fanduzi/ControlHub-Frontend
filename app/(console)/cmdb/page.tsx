import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { CmdbTable } from "@/components/cmdb/cmdb-table";
import { listResourceViewModels } from "@/lib/view-models";

export default async function CmdbPage() {
  const t = await getTranslations();
  const resources = await listResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.cmdb.eyebrow")}
        title={t("pages.cmdb.title")}
        description={t("pages.cmdb.description")}
      />
      <CmdbTable resources={resources} />
    </div>
  );
}
