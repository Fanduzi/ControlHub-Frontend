import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { ResourceTable } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { parseResourceListSearchParams } from "@/lib/list-page-search-params";
import { listResourceViewModels } from "@/lib/view-models";
import { listResourceTypes } from "@/services/settings";

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const params = await parseResourceListSearchParams(searchParams);
  const [{ items: resources, pageInfo }, resourceTypes] = await Promise.all([
    listResourceViewModels(params),
    listResourceTypes().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.resources.eyebrow")}
        title={t("pages.resources.title")}
        description={t("pages.resources.description")}
        actions={
          <Button size="sm">{t("common.actions.registerResource")}</Button>
        }
      />

      <ResourceTable
        resources={resources}
        pageInfo={pageInfo}
        resourceTypes={resourceTypes}
      />
    </div>
  );
}
