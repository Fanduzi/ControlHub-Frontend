import { apiClient } from "@/services/api-client";
import type {
  DictionaryItem,
  DictionaryItemListResponse,
  DictionaryRecord,
  Environment,
  EnvironmentListResponse,
  Owner,
  OwnerListResponse,
  RelationTypeDefinition,
  RelationTypeListResponse,
  ResourceTypeDefinition,
  ResourceTypeListResponse,
  Role,
  RoleListResponse,
} from "@/types/settings";

export async function listEnvironments(): Promise<Environment[]> {
  const response = await apiClient<EnvironmentListResponse>("/environments");

  return response.items;
}

export async function listOwners(): Promise<Owner[]> {
  const response = await apiClient<OwnerListResponse>("/owners");

  return response.items;
}

export async function listRoles(): Promise<Role[]> {
  const response = await apiClient<RoleListResponse>("/roles");

  return response.items;
}

export async function listResourceTypes(): Promise<ResourceTypeDefinition[]> {
  const response = await apiClient<ResourceTypeListResponse>("/resource-types");

  return response.items;
}

export async function listRelationTypes(): Promise<RelationTypeDefinition[]> {
  const response = await apiClient<RelationTypeListResponse>("/relation-types");

  return response.items;
}

export async function listLifecycleStatuses(): Promise<DictionaryItem[]> {
  try {
    const response = await apiClient<DictionaryItemListResponse>("/lifecycle-statuses");

    return response.items;
  } catch {
    return [];
  }
}

export async function listHealthStatuses(): Promise<DictionaryItem[]> {
  try {
    const response = await apiClient<DictionaryItemListResponse>("/health-statuses");

    return response.items;
  } catch {
    return [];
  }
}

export async function listResourceSubtypes(
  resourceType: string,
): Promise<DictionaryItem[]> {
  try {
    const res = await apiClient<{ subtypes: DictionaryItem[] }>(
      `/resource-subtypes?resourceType=${encodeURIComponent(resourceType)}`,
    );
    return res.subtypes;
  } catch {
    return [];
  }
}

const fallbackDictionaries: DictionaryRecord[] = [
  {
    key: "resourceType",
    description: "Top-level asset families (static fallback)",
    values: [
      "host",
      "database_instance",
      "database_cluster",
      "service",
      "domain_name",
      "virtual_ip",
      "database_proxy",
      "control_plane_component",
    ],
  },
  {
    key: "relationType",
    description: "Inter-resource relationship types (static fallback)",
    values: ["member_of", "depends_on", "runs_on", "points_to", "fronts", "manages", "replicates_to"],
  },
  {
    key: "lifecycleStatus",
    description: "Asset lifecycle classification",
    values: ["provisioning", "running", "stopped", "degraded", "decommissioning"],
  },
  {
    key: "healthStatus",
    description: "Operator health posture signal",
    values: ["healthy", "warning", "critical", "unknown"],
  },
];

export async function listDictionaries(): Promise<DictionaryRecord[]> {
  try {
    const [resourceTypes, relationTypes] = await Promise.all([
      listResourceTypes(),
      listRelationTypes(),
    ]);

    const dictionaries: DictionaryRecord[] = [
      {
        key: "resourceType",
        description: "Top-level asset families from backend taxonomy",
        values: resourceTypes.map((rt) => rt.key),
      },
      {
        key: "relationType",
        description: "Inter-resource relationship types from backend taxonomy",
        values: relationTypes.map((rt) => rt.key),
      },
      {
        key: "lifecycleStatus",
        description: "Asset lifecycle classification",
        values: ["provisioning", "running", "stopped", "degraded", "decommissioning"],
      },
      {
        key: "healthStatus",
        description: "Operator health posture signal",
        values: ["healthy", "warning", "degraded", "critical"],
      },
    ];

    return dictionaries;
  } catch {
    return fallbackDictionaries;
  }
}
