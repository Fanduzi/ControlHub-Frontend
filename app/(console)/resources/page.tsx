import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { ResourceTable } from "@/components/resources/resource-table";
import { Button } from "@/components/ui/button";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parseResourceListSearchParams } from "@/lib/list-page-search-params";
import { listResourceViewModels } from "@/lib/view-models";
import { listResourceTypes } from "@/services/settings";
import type { ResourceListParams } from "@/types/resource";

const SUBTYPE_OPTIONS_PAGE_SIZE = 500;

function buildSubtypeOptionsParams(
  params: ResourceListParams,
): ResourceListParams {
  return {
    resourceType: params.resourceType,
    environmentId: params.environmentId,
    environmentSlug: params.environmentSlug,
    page: 1,
    pageSize: SUBTYPE_OPTIONS_PAGE_SIZE,
  };
}

async function listAvailableSubtypes(params: ResourceListParams) {
  const subtypeParams = buildSubtypeOptionsParams(params);
  const firstPage = await listResourceViewModels(subtypeParams);
  const remainingPages = Array.from(
    { length: Math.max(firstPage.pageInfo.totalPages - 1, 0) },
    (_, index) => index + 2,
  );
  const remainingResponses = await Promise.all(
    remainingPages.map((page) =>
      listResourceViewModels({
        ...subtypeParams,
        page,
      }),
    ),
  );

  return Array.from(
    new Set(
      [firstPage, ...remainingResponses]
        .flatMap((response) => response.items)
        .map((resource) => resource.resourceSubtype)
        .filter(Boolean),
    ),
  ).sort();
}

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations();
  const parsedParams = await parseResourceListSearchParams(searchParams);
  const params = await resolveEnvironmentSlugToId(parsedParams);
  const [{ items: resources, pageInfo }, resourceTypes, availableSubtypes] = await Promise.all([
    listResourceViewModels(params),
    listResourceTypes().catch(() => []),
    listAvailableSubtypes(params),
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
        availableSubtypes={availableSubtypes}
      />
    </div>
  );
}
