import { apiClient } from "@/services/api-client";
import type { TopologyParams, TopologyResponse } from "@/types/resource";

function buildTopologyPath(resourceId: string, params: TopologyParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.depth) {
    searchParams.set("depth", String(params.depth));
  }
  if (params.direction) {
    searchParams.set("direction", params.direction);
  }
  if (params.relationType) {
    searchParams.set("relationType", params.relationType);
  }

  const encodedId = encodeURIComponent(resourceId);
  const query = searchParams.toString();
  return query ? `/resources/${encodedId}/topology?${query}` : `/resources/${encodedId}/topology`;
}

export async function getResourceTopology(
  resourceId: string,
  params?: TopologyParams,
): Promise<TopologyResponse | null> {
  try {
    return await apiClient<TopologyResponse>(buildTopologyPath(resourceId, params));
  } catch (error) {
    if (error instanceof Error && /\b(404|501)\b/.test(error.message)) {
      return null;
    }

    throw error;
  }
}
