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

export class TopologyNotAvailableError extends Error {
  constructor() {
    super("Topology endpoint not available");
    this.name = "TopologyNotAvailableError";
  }
}

export async function getResourceTopology(
  resourceId: string,
  params?: TopologyParams,
): Promise<TopologyResponse | null> {
  try {
    return await apiClient<TopologyResponse>(buildTopologyPath(resourceId, params));
  } catch (error) {
    // 501 = endpoint not implemented → signal unavailable state
    if (error instanceof Error && /\b501\b/.test(error.message)) {
      throw new TopologyNotAvailableError();
    }

    // All other errors (including 404 = resource not found) propagate
    throw error;
  }
}
