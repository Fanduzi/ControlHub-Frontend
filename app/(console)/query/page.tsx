import { QueryWorkbench } from "@/components/query/query-workbench";
import { isAllFilter } from "@/lib/query-target-display";
import { parseQueryWorkbenchSearchParams } from "@/lib/query-workbench-search-params";
import { getQueryTargets } from "@/services/query-targets";
import type { QueryTarget } from "@/types/query-target";

function parseTargetId(value: string | string[] | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return undefined;
  const parsed = Number(first);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

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
  const targetId = parseTargetId(resolved.targetId);
  const initialFilters = await parseQueryWorkbenchSearchParams(Promise.resolve(resolved));

  const { items: navigatorItems, pageInfo } = await getQueryTargets({
    page: 1,
    pageSize: 50,
    ...(initialFilters.q && { q: initialFilters.q }),
    ...(!isAllFilter(initialFilters.engine) && { engine: initialFilters.engine }),
  });

  let selectedTarget: QueryTarget | undefined;
  if (targetId !== undefined) {
    const response = await getQueryTargets({ targetId });
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
      />
    </div>
  );
}
