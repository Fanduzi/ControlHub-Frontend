import { apiClient, ApiError } from "@/services/api-client";
import { appendRepeated } from "@/lib/pagination";
import type {
  ClusterMember,
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

export async function listClusterMembers(
  resourceId: number,
): Promise<ClusterMember[]> {
  type MemberRow = {
    resourceId: number;
    name: string;
    displayName: string;
    resourceType: string;
    resourceSubtype: string;
    lifecycleStatus: string;
    healthStatus: string;
    profileSummary?: ClusterMember["profileSummary"];
  };

  const response = await apiClient<{ members: MemberRow[] }>(
    `/resources/${resourceId}/members`,
  );

  return response.members.map((row) => ({
    id: row.resourceId,
    name: row.name,
    displayName: row.displayName,
    resourceType: row.resourceType as ClusterMember["resourceType"],
    resourceSubtype: row.resourceSubtype,
    lifecycleStatus: row.lifecycleStatus,
    healthStatus: row.healthStatus,
    profileSummary: row.profileSummary,
  }));
}

export async function listDatabaseResources(): Promise<Resource[]> {
  return listAllResources({
    resourceType: ["database_instance", "database_cluster"],
  });
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
  const critical = items.filter(
    (resource) => resource.healthStatus === "critical",
  ).length;
  const warning = items.filter(
    (resource) => resource.healthStatus === "warning",
  ).length;
  const pending = items.filter(
    (resource) => resource.lifecycleStatus !== "running",
  ).length;

  return {
    total,
    critical,
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
