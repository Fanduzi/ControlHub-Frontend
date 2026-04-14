import { getTranslations } from "next-intl/server";

import { DetailPanel } from "@/components/blocks/detail-panel";
import { PageHeader } from "@/components/blocks/page-header";
import { DatabaseTable } from "@/components/databases/database-table";
import { parseResourceListSearchParams } from "@/lib/list-page-search-params";
import {
  getDatabasePostureCounts,
  listDatabaseResourceViewModels,
} from "@/lib/view-models";

export default async function DatabasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const params = await parseResourceListSearchParams(searchParams);
  const [
    { items: databaseResources, pageInfo },
    { clusters, instances },
  ] = await Promise.all([
    listDatabaseResourceViewModels(params),
    getDatabasePostureCounts(params),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.databases.eyebrow")}
        title={t("pages.databases.title")}
        description={t("pages.databases.description")}
      />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <DatabaseTable resources={databaseResources} pageInfo={pageInfo} />
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
                {clusters}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-4">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {t("pages.databases.posture.instances")}
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {instances}
              </p>
            </div>
          </div>
        </DetailPanel>
      </div>
    </div>
  );
}
