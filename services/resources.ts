// input: shared API client, pagination helper, and resource wire types
// output: resource/profile/relation/effective-value reads and mutations, override controls, relationship-rule discovery, reviewed bulk label mutations, and server-owned ingestion multipart calls with recoverable fresh previews
// pos: frontend API boundary for resources; forwards server-owned relationship constraints, completeness read-only writes, override versions, bulk review fingerprints, and ingestion fingerprints/replacement previews unchanged
// note: if this file changes, update this header and module README.md.
import { apiClient, ApiError } from "@/services/api-client";
import { appendRepeated } from "@/lib/pagination";
import type {
  ClusterMember,
  BulkResourceMutationPreview,
  BulkResourceMutationRequest,
  CreateResourceInput,
  CreateResourceRelationInput,
  EffectiveValuesResponse,
  OverrideVersionResponse,
  Resource,
  ResourceDetailResponse,
  ResourceListParams,
  ResourceListResponse,
  ResourceProfileResponse,
  ResourceRelation,
  ResourceRelationListResponse,
  RelationshipRulesResponse,
  ResourceOverrideField,
  UpdateResourceInput,
} from "@/types/resource";

export type IngestionFormat = "csv" | "json";

export type IngestionValueDiff = {
  before: unknown;
  after: unknown;
};

export type IngestionRelation = {
  type: string;
  targetId: number;
};

export type IngestionPreview = {
  confirmable: boolean;
  fingerprint: string;
  rows: Array<{
    row: number;
    action: "create" | "update" | "conflict";
    matchedId?: number;
    conflict?: string;
    diff: {
      fields: Record<string, IngestionValueDiff>;
      profile: Record<string, IngestionValueDiff>;
      observed: Record<string, IngestionValueDiff>;
      relations: { added: IngestionRelation[]; removed: IngestionRelation[] };
    };
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isIngestionPreview(value: unknown): value is IngestionPreview {
  if (!isRecord(value) || typeof value.confirmable !== "boolean" || typeof value.fingerprint !== "string" || !Array.isArray(value.rows)) return false;
  return value.rows.every((row) => isRecord(row)
    && typeof row.row === "number"
    && (row.action === "create" || row.action === "update" || row.action === "conflict")
    && isRecord(row.diff)
    && isRecord(row.diff.fields)
    && isRecord(row.diff.profile)
    && isRecord(row.diff.observed)
    && isRecord(row.diff.relations)
    && Array.isArray(row.diff.relations.added)
    && Array.isArray(row.diff.relations.removed));
}

/** Returns a server-supplied replacement preview for recoverable confirm conflicts. */
export function getIngestionPreview(error: unknown): IngestionPreview | undefined {
  if (!(error instanceof ApiError) || error.status !== 409 || (error.code !== "ingestion_conflict" && error.code !== "ingestion_preview_stale")) return undefined;
  const preview = error.body?.preview;
  return isIngestionPreview(preview) ? preview : undefined;
}

function ingestionFormData(
  file: File,
  format: IngestionFormat,
  fingerprint?: string,
): FormData {
  const formData = new FormData();
  formData.append("format", format);
  formData.append("file", file);
  if (fingerprint) formData.append("fingerprint", fingerprint);
  return formData;
}

export async function previewIngestion(
  file: File,
  format: IngestionFormat,
): Promise<IngestionPreview> {
  return apiClient<IngestionPreview>("/admin/ingestions/preview", {
    method: "POST",
    body: ingestionFormData(file, format),
  });
}

export async function confirmIngestion(
  file: File,
  format: IngestionFormat,
  fingerprint: string,
): Promise<IngestionPreview> {
  return apiClient<IngestionPreview>("/admin/ingestions/confirm", {
    method: "POST",
    body: ingestionFormData(file, format, fingerprint),
  });
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
  for (const environmentId of Array.isArray(params.environmentId)
    ? params.environmentId
    : params.environmentId === undefined ? [] : [params.environmentId]) {
    searchParams.append("environmentId", String(environmentId));
  }
  appendRepeated(searchParams, "lifecycleStatus", params.lifecycleStatus);
  appendRepeated(searchParams, "healthStatus", params.healthStatus);
  if (params.q) {
    searchParams.set("q", params.q);
  }
  if (params.ownerId !== undefined) {
    searchParams.set("ownerId", String(params.ownerId));
  }
  appendRepeated(searchParams, "label", params.label);
  if (params.includeArchived) {
    searchParams.set("includeArchived", "true");
  }
  if (params.archivedOnly) {
    searchParams.set("archivedOnly", "true");
  }

  const query = searchParams.toString();
  return query ? `/resources?${query}` : "/resources";
}

function resourceWriteBody(input: CreateResourceInput | UpdateResourceInput) {
  const write = { ...input } as typeof input & {
    completeness?: unknown;
  };
  delete write.completeness;

  return JSON.stringify(write);
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

export async function getEffectiveValues(
  id: number,
): Promise<EffectiveValuesResponse> {
  return apiClient<EffectiveValuesResponse>(
    `/resources/${id}/effective-values`,
  );
}

export async function setResourceOverride(
  id: number,
  field: ResourceOverrideField,
  value: string,
  expectedVersion: number,
): Promise<OverrideVersionResponse> {
  return apiClient<OverrideVersionResponse>(
    `/resources/${id}/overrides/${field}`,
    {
      method: "PUT",
      body: JSON.stringify({ value, expectedVersion }),
    },
  );
}

export async function clearResourceOverride(
  id: number,
  field: ResourceOverrideField,
  expectedVersion: number,
): Promise<void> {
  await apiClient<void>(`/resources/${id}/overrides/${field}`, {
    method: "DELETE",
    body: JSON.stringify({ expectedVersion }),
  });
}

export async function listResourceRelations(
  resourceId: number,
): Promise<ResourceRelation[]> {
  const response = await apiClient<ResourceRelationListResponse>(
    `/resources/${resourceId}/relations`,
  );

  return response.items;
}

export async function getResourceRelationRules(
  resourceId: number,
): Promise<RelationshipRulesResponse> {
  return apiClient<RelationshipRulesResponse>(
    `/resources/${resourceId}/relation-rules`,
  );
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
    resourceType: ["database_instance", "database_cluster", "database_proxy"],
  });
}

export async function listAttentionResources(
  params: ResourceListParams = {},
): Promise<Resource[]> {
  const items = await listAllResources(params);

  return items.filter(
    (resource) =>
      resource.healthStatus !== "healthy" ||
      resource.lifecycleStatus !== "running" ||
      hasMemberSignalIssues(resource),
  );
}

function hasMemberSignalIssues(resource: Resource): boolean {
  if (resource.resourceType !== "database_cluster") return false;
  const summary = resource.databaseOperationalSummary;
  if (!summary) return false;
  return (
    (summary.criticalMemberCount ?? 0) > 0 ||
    (summary.warningMemberCount ?? 0) > 0 ||
    (summary.stoppedMemberCount ?? 0) > 0 ||
    (summary.degradedMemberCount ?? 0) > 0
  );
}

export async function getOverviewMetrics(params: ResourceListParams = {}) {
  const items = await listAllResources(params);
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
    body: resourceWriteBody(input),
  });
}

export async function updateResource(
  id: number,
  input: UpdateResourceInput,
): Promise<Resource> {
  return apiClient<Resource>(`/resources/${id}`, {
    method: "PATCH",
    body: resourceWriteBody(input),
  });
}

export async function previewBulkResourceMutation(
  request: BulkResourceMutationRequest,
): Promise<BulkResourceMutationPreview> {
  return apiClient<BulkResourceMutationPreview>("/resources/bulk-mutations/preview", {
    method: "POST",
    body: JSON.stringify(request),
  });
}

export async function confirmBulkResourceMutation(
  request: BulkResourceMutationRequest,
  reviewedFingerprint: string,
): Promise<BulkResourceMutationPreview> {
  return apiClient<BulkResourceMutationPreview>("/resources/bulk-mutations/confirm", {
    method: "POST",
    body: JSON.stringify({ request, reviewedFingerprint }),
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

export async function deleteProfile(id: number): Promise<void> {
  await apiClient<void>(`/resources/${id}/profile`, {
    method: "DELETE",
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
