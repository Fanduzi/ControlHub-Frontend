import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { QueryWorkbench } from "@/components/query/query-workbench";
import { parseQueryWorkbenchSearchParams } from "@/lib/query-workbench-search-params";
import { getQueryTargets } from "@/services/query-targets";

export default async function QueryWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const [initialFilters, { items: targets }] = await Promise.all([
    parseQueryWorkbenchSearchParams(searchParams),
    getQueryTargets(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t("pages.query.eyebrow")}
        title={t("pages.query.title")}
        description={t("pages.query.description")}
      />
      <QueryWorkbench targets={targets} initialFilters={initialFilters} />
    </div>
  );
}
