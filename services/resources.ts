import { apiClient, ApiError } from "@/services/api-client";
import type {
  CreateResourceInput,
  CreateResourceRelationInput,
  Resource,
  ResourceDetailResponse,
  ResourceListParams,
  ResourceListResponse,
  ResourceProfileResponse,
  ResourceRelation,
  ResourceRelationListResponse,
  UpdateResourceInput,
} from "@/types/resource";

function appendRepeated(
  searchParams: URLSearchParams,
  key: string,
  value: string | string[] | undefined,
) {
  if (!value) return;
  const values = Array.isArray(value) ? value : [value];
  for (const v of values) {
    searchParams.append(key, v);
  }
}

function buildResourceListPath(params: ResourceListParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.page) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize) {
    searchParams.set("pageSize", String(params.pageSize));
  }
  appendRepeated(searchParams, "resourceType", params.resourceType);
  appendRepeated(searchParams, "resourceSubtype", params.resourceSubtype);
  if (params.environmentId !== undefined) {
    searchParams.set("environmentId", String(params.environmentId));
  }
  appendRepeated(searchParams, "lifecycleStatus", params.lifecycleStatus);
  appendRepeated(searchParams, "healthStatus", params.healthStatus);
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.includeArchived) {
    searchParams.set("includeArchived", "true");
  }
  if (params.archivedOnly) {
    searchParams.set("archivedOnly", "true");
  }

  const query = searchParams.toString();
  return query ? `/resources?${query}` : "/resources";
}

export async function listResources(
  params: ResourceListParams = {},
): Promise<ResourceListResponse> {
  return apiClient<ResourceListResponse>(buildResourceListPath(params));
}

export async function listAllResources(params: ResourceListParams = {}): Promise<Resource[]> {
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

export async function getResourceById(
  id: number,
): Promise<ResourceDetailResponse | null> {
  try {
    return await apiClient<ResourceDetailResponse>(`/resources/${id}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getResourceProfileById(
  id: number,
): Promise<ResourceProfileResponse | null> {
  try {
    return await apiClient<ResourceProfileResponse>(
      `/resources/${id}/profile`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }

    throw error;
  }
}

export async function listResourceRelations(
  resourceId: number,
): Promise<ResourceRelation[]> {
  const response = await apiClient<ResourceRelationListResponse>(
    `/resources/${resourceId}/relations`,
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

export async function createResource(
  input: CreateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>("/resources", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateResource(
  id: number,
  input: UpdateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>(`/resources/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function updateProfile(
  id: number,
  fields: Record<string, string | number | boolean>,
): Promise<void> {
  await apiClient<void>(`/resources/${id}/profile`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function createResourceRelation(
  resourceId: number,
  input: CreateResourceRelationInput,
): Promise<ResourceRelation> {
  return apiClient<ResourceRelation>(
    `/resources/${resourceId}/relations`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteResourceRelation(
  relationId: number,
): Promise<void> {
  await apiClient<void>(`/resource-relations/${relationId}`, {
    method: "DELETE",
  });
}

export async function archiveResource(
  id: number,
  reason?: string,
): Promise<Resource> {
  return apiClient<Resource>(`/resources/${id}/archive`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function unarchiveResource(id: number): Promise<Resource> {
  return apiClient<Resource>(`/resources/${id}/unarchive`, {
    method: "POST",
  });
}
