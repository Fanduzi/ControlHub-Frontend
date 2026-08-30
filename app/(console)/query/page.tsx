// input: URL params and query services
// output: fail-closed Query Workbench props
// pos: authenticated Query Workbench route
// note: update app/(console)/query/README.md if this changes
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
  const hasExplicitTargetId = resolved.targetId !== undefined;
  const targetId = typeof resolved.targetId === "string"
    ? parsePositiveDecimalInteger(resolved.targetId)
    : undefined;
  const parsedEnvironmentId = parsePositiveDecimalInteger(resolved.environmentId);
  const scope = resolved.environmentId !== undefined && parsedEnvironmentId === undefined
    ? null
    : await resolveEnvironmentSlugToId({
        environmentId: parsedEnvironmentId,
        environmentSlug: Array.isArray(resolved.environment) ? resolved.environment[0] : resolved.environment,
      });
  const initialFilters = await parseQueryWorkbenchSearchParams(Promise.resolve(resolved));

  if (!scope) {
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

  const environmentId = typeof scope.environmentId === "number" ? scope.environmentId : undefined;

  const { items: navigatorItems, pageInfo } = await getQueryTargets({
    page: 1,
    pageSize: 50,
    ...(environmentId !== undefined && { environmentId }),
    ...(initialFilters.q && { q: initialFilters.q }),
    ...(!isAllFilter(initialFilters.engine) && { engine: initialFilters.engine }),
  });

  let selectedTarget: QueryTarget | undefined;
  if (targetId !== undefined) {
    const response = await getQueryTargets({
      targetId,
      ...(environmentId !== undefined && { environmentId }),
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
        initialActiveTargetId={hasExplicitTargetId ? selectedTarget?.resourceId ?? null : undefined}
        environmentId={environmentId}
      />
    </div>
  );
}
