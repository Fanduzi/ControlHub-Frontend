import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { CmdbTable } from "@/components/cmdb/cmdb-table";
import { parseResourceListSearchParams } from "@/lib/list-page-search-params";
import { listResourceViewModels } from "@/lib/view-models";

export default async function CmdbPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const params = await parseResourceListSearchParams(searchParams);
  const { items: resources, pageInfo } = await listResourceViewModels(params);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.cmdb.eyebrow")}
        title={t("pages.cmdb.title")}
        description={t("pages.cmdb.description")}
      />
      <CmdbTable resources={resources} pageInfo={pageInfo} />
    </div>
  );
}
