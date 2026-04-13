import { apiClient } from "@/services/api-client";
import type {
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
    values: ["member_of", "depends_on", "contains", "provides_to"],
  },
  {
    key: "lifecycleStatus",
    description: "Asset lifecycle classification",
    values: ["running", "pending", "retired"],
  },
  {
    key: "healthStatus",
    description: "Operator health posture signal",
    values: ["healthy", "warning", "degraded", "critical"],
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
        values: ["running", "pending", "retired"],
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
