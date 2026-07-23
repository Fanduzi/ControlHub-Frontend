import { apiClient } from "@/services/api-client";
import type {
  DisclosurePolicy,
  DisclosurePolicyListResponse,
  DisclosurePolicyUpsertRequest,
} from "@/types/query-disclosure";

/**
 * List all disclosure policies for a target. Admin-only.
 */
export async function listDisclosurePolicies(
  targetResourceId: number,
): Promise<DisclosurePolicyListResponse> {
  return apiClient<DisclosurePolicyListResponse>(
    `/query-disclosure-policies?targetResourceId=${targetResourceId}`,
  );
}

/**
 * Create a disclosure policy. Admin-only.
 */
export async function createDisclosurePolicy(
  input: DisclosurePolicyUpsertRequest,
): Promise<DisclosurePolicy> {
  return apiClient<DisclosurePolicy>("/query-disclosure-policies", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/**
 * Update a disclosure policy. Admin-only.
 */
export async function updateDisclosurePolicy(
  input: DisclosurePolicyUpsertRequest,
): Promise<DisclosurePolicy> {
  return apiClient<DisclosurePolicy>("/query-disclosure-policies", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

/**
 * Delete a disclosure policy. Admin-only.
 */
export async function deleteDisclosurePolicy(scope: {
  targetResourceId: number;
  databaseName: string;
  objectName: string;
  columnName: string;
}): Promise<void> {
  const params = new URLSearchParams({
    targetResourceId: String(scope.targetResourceId),
    databaseName: scope.databaseName,
    objectName: scope.objectName,
    columnName: scope.columnName,
  });
  await apiClient(`/query-disclosure-policies?${params.toString()}`, {
    method: "DELETE",
  });
}
