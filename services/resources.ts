import { apiClient } from "@/services/api-client";
import type {
  Resource,
  ResourceListParams,
  ResourceListResponse,
  ResourceProfileResponse,
  ResourceRelation,
  ResourceRelationListResponse,
} from "@/types/resource";

function buildResourceListPath(params: ResourceListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  if (params.resourceType) {
    searchParams.set("resourceType", params.resourceType);
  }
  if (params.environmentId) {
    searchParams.set("environmentId", params.environmentId);
  }
  if (params.lifecycleStatus) {
    searchParams.set("lifecycleStatus", params.lifecycleStatus);
  }
  if (params.healthStatus) {
    searchParams.set("healthStatus", params.healthStatus);
  }
  if (params.q) {
    searchParams.set("q", params.q);
  }

  const query = searchParams.toString();
  return query ? `/resources?${query}` : "/resources";
}

export async function listResources(
  params: ResourceListParams = {},
): Promise<ResourceListResponse> {
  return apiClient<ResourceListResponse>(buildResourceListPath(params));
}

async function listAllResources(params: ResourceListParams = {}): Promise<Resource[]> {
  const firstPage = await listResources(params);
  const allItems = [...firstPage.items];

  for (let page = 2; page <= firstPage.pageInfo.totalPages; page += 1) {
    const response = await listResources({
      ...params,
      page,
      pageSize: firstPage.pageInfo.pageSize,
    });

    allItems.push(...response.items);
  }

  return allItems;
}

export async function getResourceById(id: string): Promise<Resource | null> {
  try {
    return await apiClient<Resource>(`/resources/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }

    throw error;
  }
}

export async function getResourceProfileById(
  id: string,
): Promise<ResourceProfileResponse | null> {
  try {
    return await apiClient<ResourceProfileResponse>(
      `/resources/${encodeURIComponent(id)}/profile`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }

    throw error;
  }
}

export async function listResourceRelations(
  resourceId: string,
): Promise<ResourceRelation[]> {
  const response = await apiClient<ResourceRelationListResponse>(
    `/resources/${encodeURIComponent(resourceId)}/relations`,
  );

  return response.items;
}

export async function listDatabaseResources(): Promise<Resource[]> {
  const items = await listAllResources();

  return items.filter((resource) =>
    ["database_instance", "database_cluster"].includes(resource.resourceType),
  );
}

export async function listAttentionResources(): Promise<Resource[]> {
  const items = await listAllResources();

  return items.filter(
    (resource) =>
      resource.healthStatus !== "healthy" ||
      resource.lifecycleStatus !== "running",
  );
}

export async function getOverviewMetrics() {
  const items = await listAllResources();
  const total = items.length;
  const degraded = items.filter(
    (resource) => resource.healthStatus === "degraded",
  ).length;
  const warning = items.filter(
    (resource) => resource.healthStatus === "warning",
  ).length;
  const pending = items.filter(
    (resource) => resource.lifecycleStatus !== "running",
  ).length;

  return {
    total,
    degraded,
    warning,
    pending,
  };
}
