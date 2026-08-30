// input: API client, typed resource/environment topology parameters
// output: validated resource and environment topology requests
// pos: topology backend transport boundary
// note: if this file changes, update this header and services/README.md.
import { ApiError, apiClient } from "@/services/api-client";
import type { EnvironmentTopologyParams, TopologyParams, TopologyResponse } from "@/types/resource";

function buildTopologyPath(resourceId: number, params: TopologyParams = {}) {
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

  const query = searchParams.toString();
  return query ? `/resources/${resourceId}/topology?${query}` : `/resources/${resourceId}/topology`;
}

function buildEnvironmentTopologyPath(environmentId: number, params: EnvironmentTopologyParams = {}) {
  const searchParams = new URLSearchParams();
  const rootResourceId = params.rootResourceId;

  if (rootResourceId !== undefined && Number.isSafeInteger(rootResourceId) && rootResourceId > 0) {
    searchParams.set("rootResourceId", String(rootResourceId));
  }
  if (params.depth) {
    searchParams.set("depth", String(params.depth));
  }

  const query = searchParams.toString();
  return query ? `/environments/${environmentId}/topology?${query}` : `/environments/${environmentId}/topology`;
}

export class TopologyNotAvailableError extends Error {
  constructor() {
    super("Topology endpoint not available");
    this.name = "TopologyNotAvailableError";
  }
}

export async function getResourceTopology(
  resourceId: number,
  params?: TopologyParams,
): Promise<TopologyResponse | null> {
  try {
    return await apiClient<TopologyResponse>(buildTopologyPath(resourceId, params));
  } catch (error) {
    // 501 = endpoint not implemented → signal unavailable state
    if (error instanceof ApiError && error.status === 501) {
      throw new TopologyNotAvailableError();
    }

    // All other errors (including 404 = resource not found) propagate
    throw error;
  }
}

export async function getEnvironmentTopology(
  environmentId: number,
  params?: EnvironmentTopologyParams,
): Promise<TopologyResponse> {
  return apiClient<TopologyResponse>(buildEnvironmentTopologyPath(environmentId, params));
}
