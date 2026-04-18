import { apiClient } from "@/services/api-client";
import type {
  CreateResourceInput,
  CreateResourceRelationInput,
  Resource,
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
  if (params.environmentId) {
    searchParams.set("environmentId", params.environmentId);
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

export async function createResource(
  input: CreateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>("/resources", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateResource(
  id: string,
  input: UpdateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>(`/resources/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createResourceRelation(
  resourceId: string,
  input: CreateResourceRelationInput,
): Promise<ResourceRelation> {
  return apiClient<ResourceRelation>(
    `/resources/${encodeURIComponent(resourceId)}/relations`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteResourceRelation(
  relationId: string,
): Promise<void> {
  await apiClient<void>(`/resource-relations/${encodeURIComponent(relationId)}`, {
    method: "DELETE",
  });
}

export async function archiveResource(
  id: string,
  reason?: string,
): Promise<Resource> {
  return apiClient<Resource>(`/resources/${encodeURIComponent(id)}/archive`, {
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

export async function unarchiveResource(id: string): Promise<Resource> {
  return apiClient<Resource>(`/resources/${encodeURIComponent(id)}/unarchive`, {
    method: "POST",
  });
}
