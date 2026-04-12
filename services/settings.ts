import { apiClient } from "@/services/api-client";
import type {
  DictionaryRecord,
  Environment,
  EnvironmentListResponse,
  Owner,
  OwnerListResponse,
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

const dictionaries: DictionaryRecord[] = [
  {
    key: "resourceType",
    description: "Top-level asset families supported in phase 1",
    values: ["host", "database_instance", "database_cluster", "service"],
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

export async function listDictionaries() {
  return dictionaries;
}
