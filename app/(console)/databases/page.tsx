import { getTranslations } from "next-intl/server";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { DatabaseTable } from "@/components/databases/database-table";
import { listDatabaseResourceViewModels } from "@/lib/view-models";

export default async function DatabasesPage() {
  const t = await getTranslations();
  const databaseResources = await listDatabaseResourceViewModels();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.databases.eyebrow")}
        title={t("pages.databases.title")}
        description={t("pages.databases.description")}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <DatabaseTable resources={databaseResources} />
        <DetailPanel
          title={t("pages.databases.posture.title")}
          description={t("pages.databases.posture.description")}
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.databases.posture.clusters")}
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {
                  databaseResources.filter(
                    (resource) => resource.resourceType === "database_cluster",
                  ).length
                }
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.databases.posture.instances")}
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {
                  databaseResources.filter(
                    (resource) => resource.resourceType === "database_instance",
                  ).length
                }
              </p>
            </div>
          </div>
        </DetailPanel>
      </div>
    </div>
  );
}
