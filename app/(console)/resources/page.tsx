import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { ResourceTable } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { listResourceViewModels } from "@/lib/view-models";
import { listResourceTypes } from "@/services/settings";

export default async function ResourcesPage() {
  const t = await getTranslations();
  const [resources, resourceTypes] = await Promise.all([
    listResourceViewModels(),
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

      <ResourceTable resources={resources} resourceTypes={resourceTypes} />
    </div>
  );
}
