import { getTranslations } from "next-intl/server";

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

      <div className="flex items-center gap-6 rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">{clusters}</span>
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("pages.databases.posture.clusters")}
          </span>
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-foreground">{instances}</span>
          <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {t("pages.databases.posture.instances")}
          </span>
        </div>
      </div>

      <DatabaseTable resources={databaseResources} pageInfo={pageInfo} />
    </div>
  );
}
