import { apiClient } from "@/services/api-client";
import type {
  QueryTargetListParams,
  QueryTargetListResponse,
} from "@/types/query-target";

function buildQueryTargetsPath(params: QueryTargetListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.engine) {
    searchParams.set("engine", params.engine);
  }
  if (params.environmentId !== undefined) {
    searchParams.set("environmentId", String(params.environmentId));
  }
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.targetId !== undefined) {
    searchParams.set("targetId", String(params.targetId));
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  const query = searchParams.toString();
  return query ? `/query-targets?${query}` : "/query-targets";
}

/**
 * Fetch the read-only query target context that drives the locked Query
 * Workbench shell. Readiness and query kind are derived server-side and
 * returned for the client to filter. This service never executes queries.
 */
export async function getQueryTargets(
  params: QueryTargetListParams = {},
): Promise<QueryTargetListResponse> {
  return apiClient<QueryTargetListResponse>(buildQueryTargetsPath(params));
}
