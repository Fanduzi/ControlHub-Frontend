// input: Next search params, environment/resource services, settings dictionaries, resource table
// output: scoped resource inventory page with taxonomy-backed filters; unknown environments fail closed
// pos: authenticated console resources route composition
// note: if this file changes, update header and app/(console)/resources/README.md
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/blocks/page-header";
import { ResourceTable } from "@/components/resources/resource-table";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parseResourceListSearchParams } from "@/lib/list-page-search-params";
import { listResourceViewModels } from "@/lib/view-models";
import {
  listHealthStatuses,
  listLifecycleStatuses,
  listResourceTypes,
} from "@/services/settings";
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
  if (!params) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("pages.resources.eyebrow")}
          title={t("pages.resources.title")}
          description={t("pages.resources.description")}
        />

        <ResourceTable
          resources={[]}
          pageInfo={{
            page: parsedParams.page ?? 1,
            pageSize: parsedParams.pageSize ?? 10,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          }}
          resourceTypes={[]}
          lifecycleStatuses={[]}
          healthStatuses={[]}
          availableSubtypes={[]}
        />
      </div>
    );
  }

  const [
    { items: resources, pageInfo },
    resourceTypes,
    lifecycleStatuses,
    healthStatuses,
    availableSubtypes,
  ] = await Promise.all([
    listResourceViewModels(params),
    listResourceTypes().catch(() => []),
    listLifecycleStatuses(),
    listHealthStatuses(),
    listAvailableSubtypes(params),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("pages.resources.eyebrow")}
        title={t("pages.resources.title")}
        description={t("pages.resources.description")}
      />

      <ResourceTable
        resources={resources}
        pageInfo={pageInfo}
        resourceTypes={resourceTypes}
        lifecycleStatuses={lifecycleStatuses}
        healthStatuses={healthStatuses}
        availableSubtypes={availableSubtypes}
      />
    </div>
  );
}
