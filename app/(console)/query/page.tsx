import { QueryWorkbench } from "@/components/query/query-workbench";
import { resolveEnvironmentSlugToId } from "@/lib/environment-params";
import { parsePositiveDecimalInteger } from "@/lib/list-page-search-params";
import { isAllFilter } from "@/lib/query-target-display";
import { parseQueryWorkbenchSearchParams } from "@/lib/query-workbench-search-params";
import { getQueryTargets } from "@/services/query-targets";
import type { QueryTarget } from "@/types/query-target";

function mergeTargets(navigatorItems: QueryTarget[], selected: QueryTarget | undefined): QueryTarget[] {
  if (!selected) return navigatorItems;
  if (navigatorItems.some((t) => t.resourceId === selected.resourceId)) return navigatorItems;
  return [...navigatorItems, selected];
}

export default async function QueryWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolved = await searchParams;
  const targetId = parsePositiveDecimalInteger(resolved.targetId);
  const scope = await resolveEnvironmentSlugToId({
    environmentId: parsePositiveDecimalInteger(resolved.environmentId),
    environmentSlug: Array.isArray(resolved.environment) ? resolved.environment[0] : resolved.environment,
  });
  const initialFilters = await parseQueryWorkbenchSearchParams(Promise.resolve(resolved));

  if (!scope || typeof scope.environmentId !== "number") {
    return (
      <div className="min-h-0">
        <QueryWorkbench
          targets={[]}
          pageInfo={{
            page: 1,
            pageSize: 50,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          }}
          initialFilters={initialFilters}
          initialActiveTargetId={null}
          environmentId={null}
        />
      </div>
    );
  }

  const environmentId = scope.environmentId;

  const { items: navigatorItems, pageInfo } = await getQueryTargets({
    page: 1,
    pageSize: 50,
    environmentId,
    ...(initialFilters.q && { q: initialFilters.q }),
    ...(!isAllFilter(initialFilters.engine) && { engine: initialFilters.engine }),
  });

  let selectedTarget: QueryTarget | undefined;
  if (targetId !== undefined) {
    const response = await getQueryTargets({
      targetId,
      environmentId,
    });
    selectedTarget = response.items.find((target) => target.resourceId === targetId);
  }

  const targets = mergeTargets(navigatorItems, selectedTarget);

  return (
    <div className="min-h-0">
      <QueryWorkbench
        targets={targets}
        pageInfo={pageInfo}
        initialFilters={initialFilters}
        initialActiveTargetId={targetId === undefined ? undefined : selectedTarget?.resourceId ?? null}
        environmentId={environmentId}
      />
    </div>
  );
}
