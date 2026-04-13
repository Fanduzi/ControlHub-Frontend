import { apiClient } from "@/services/api-client";
import type {
  Resource,
  ResourceListResponse,
  ResourceProfileResponse,
  ResourceRelation,
  ResourceRelationListResponse,
} from "@/types/resource";

export async function listResources(): Promise<Resource[]> {
  const response = await apiClient<ResourceListResponse>("/resources");

  return response.items;
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
  const resources = await listResources();

  return resources.filter((resource) =>
    ["database_instance", "database_cluster"].includes(resource.resourceType),
  );
}

export async function listAttentionResources(): Promise<Resource[]> {
  const resources = await listResources();

  return resources.filter(
    (resource) =>
      resource.healthStatus !== "healthy" ||
      resource.lifecycleStatus !== "running",
  );
}

export async function getOverviewMetrics() {
  const resources = await listResources();
  const total = resources.length;
  const degraded = resources.filter(
    (resource) => resource.healthStatus === "degraded",
  ).length;
  const warning = resources.filter(
    (resource) => resource.healthStatus === "warning",
  ).length;
  const pending = resources.filter(
    (resource) => resource.lifecycleStatus !== "running",
  ).length;

  return {
    total,
    degraded,
    warning,
    pending,
  };
}
