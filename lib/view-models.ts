import { formatLabel } from "@/lib/format";
import {
  listRecentAuditEvents,
  listAuditEvents,
  listResourceAuditEvents,
} from "@/services/audits";
import { listEnvironments, listOwners } from "@/services/settings";
import {
  getOverviewMetrics,
  getResourceById,
  getResourceProfileById,
  listAttentionResources,
  listClusterMembers,
  listDatabaseResources,
  listResourceRelations,
  listAllResources,
  listResources,
} from "@/services/resources";
import type {
  AuditEvent,
  AuditEventListParams,
  AuditEventListResponse,
} from "@/types/audit";
import type {
  ClusterMember,
  Resource,
  ResourceDetailResponse,
  ResourceListParams,
  ResourceListResponse,
  ResourceProfileResponse,
  ResourceRelation,
  ResourceType,
} from "@/types/resource";
import type {
  AuditEventViewModel,
  AuditEventViewModelListResponse,
  ResourceRelationViewModel,
  ResourceDetailViewModel,
  ResourceListViewModel,
  ResourceListViewModelResponse,
} from "@/types/view-models";

function buildFallbackSummary(resource: Resource): string {
  const parts: string[] = [];
  if (resource.resourceType) {
    parts.push(resource.resourceType);
  }
  if (resource.resourceSubtype) {
    parts.push(resource.resourceSubtype);
  }
  if (resource.lifecycleStatus) {
    parts.push(resource.lifecycleStatus);
  }
  return parts.length > 0 ? parts.join(" · ") : resource.displayName;
}

function fallbackLabel(id: number | null) {
  if (id === null) {
    return "Unknown";
  }

  return String(id);
}

function buildAuditSummary(event: AuditEvent) {
  return `${formatLabel(event.eventType)} completed with ${formatLabel(event.result)} result.`;
}

async function buildLookupMaps() {
  const [resources, environments, owners] = await Promise.all([
    listAllResources({ includeArchived: true }),
    listEnvironments(),
    listOwners(),
  ]);

  return {
    resourceMap: new Map<number, Resource>(resources.map((resource) => [resource.id, resource])),
    environmentMap: new Map<number, string>(
      environments.map((environment) => [environment.id, environment.name]),
    ),
    ownerMap: new Map<number, string>(owners.map((owner) => [owner.id, owner.name])),
  };
}

async function buildListLookupMaps() {
  const [environments, owners] = await Promise.all([
    listEnvironments(),
    listOwners(),
  ]);

  return {
    environmentMap: new Map<number, string>(
      environments.map((environment) => [environment.id, environment.name]),
    ),
    ownerMap: new Map<number, string>(owners.map((owner) => [owner.id, owner.name])),
  };
}

function toRelationViewModel(
  relation: ResourceRelation,
  currentResourceId: number,
  resourceMap: Map<number, Resource>,
): ResourceRelationViewModel {
  const outgoing = relation.fromResourceId === currentResourceId;
  const relatedResourceId = outgoing
    ? relation.toResourceId
    : relation.fromResourceId;

  const relatedFromMap = resourceMap.get(relatedResourceId);
  const related = relation.relatedResource ?? (relatedFromMap
    ? { id: relatedFromMap.id, displayName: relatedFromMap.displayName, resourceType: relatedFromMap.resourceType, resourceSubtype: relatedFromMap.resourceSubtype, healthStatus: relatedFromMap.healthStatus }
    : undefined);

  return {
    ...relation,
    relatedResourceId,
    relatedResourceName:
      related?.displayName ??
      relatedFromMap?.displayName ??
      String(relatedResourceId),
    direction: outgoing ? "outgoing" : "incoming",
    relatedResource: related ?? null,
  };
}

function toAuditEventViewModel(
  event: AuditEvent,
  resourceMap: Map<number, Resource>,
  environmentMap: Map<number, string>,
): AuditEventViewModel {
  const target = event.targetResourceId === null ? undefined : resourceMap.get(event.targetResourceId);

  return {
    ...event,
    actorLabel: fallbackLabel(event.actorUserId),
    targetResourceName: target?.displayName ?? fallbackLabel(event.targetResourceId),
    environmentLabel: target
      ? (environmentMap.get(target.environmentId) ?? String(target.environmentId))
      : "Unknown",
    summary: buildAuditSummary(event),
  };
}

type ResourceListResult = Resource[] | ResourceListResponse;
type AuditEventListResult = AuditEvent[] | AuditEventListResponse;

function fallbackPageInfo(totalItems: number) {
  return {
    page: 1,
    pageSize: totalItems,
    totalItems,
    totalPages: totalItems > 0 ? 1 : 0,
  };
}

function toResourceItems(response: ResourceListResult): Resource[] {
  return Array.isArray(response) ? response : response.items;
}

function toAuditEventItems(response: AuditEventListResult): AuditEvent[] {
  return Array.isArray(response) ? response : response.items;
}

function toResourcePageInfo(response: ResourceListResult) {
  return Array.isArray(response)
    ? fallbackPageInfo(response.length)
    : response.pageInfo;
}

function toAuditEventPageInfo(response: AuditEventListResult) {
  return Array.isArray(response)
    ? fallbackPageInfo(response.length)
    : response.pageInfo;
}

function toAuditEventViewModels(
  events: AuditEvent[],
  resourceMap: Map<number, Resource>,
  environmentMap: Map<number, string>,
): AuditEventViewModel[] {
  return events.map((event) =>
    toAuditEventViewModel(event, resourceMap, environmentMap),
  );
}

function compareResourcesForList(left: Resource, right: Resource) {
  return left.name.localeCompare(right.name);
}

export async function getDatabasePostureCounts(
  params: ResourceListParams = {},
): Promise<{ clusters: number; instances: number }> {
  const baseParams = {
    ...params,
    page: 1,
    pageSize: 1,
  };

  const [instanceResponse, clusterResponse] = await Promise.all([
    listResources({
      ...baseParams,
      resourceType: "database_instance",
    }) as Promise<ResourceListResult>,
    listResources({
      ...baseParams,
      resourceType: "database_cluster",
    }) as Promise<ResourceListResult>,
  ]);

  return {
    instances: toResourcePageInfo(instanceResponse).totalItems,
    clusters: toResourcePageInfo(clusterResponse).totalItems,
  };
}

async function listPaginatedResourcesByTypes(
  params: ResourceListParams,
  resourceTypes: ResourceType[],
): Promise<ResourceListViewModelResponse> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  // Fetch each resource type separately — backend handles resourceSubtype
  // filtering natively (Phase 12.7). We merge client-side because the
  // backend only accepts a single resourceType per request.
  const responses = await Promise.all(
    resourceTypes.map((resourceType) =>
      listResources({
        ...params,
        resourceType,
        // Request all items up to the current page boundary so we can
        // merge, sort, and slice client-side while preserving true totals.
        page: 1,
        pageSize: page * pageSize,
      }) as Promise<ResourceListResult>,
    ),
  );

  // Sum true totals from backend pageInfo for each resource type
  const totalItems = responses.reduce(
    (sum, response) => sum + toResourcePageInfo(response).totalItems,
    0,
  );

  const mergedItems = responses
    .flatMap((response) => toResourceItems(response))
    .sort(compareResourcesForList);

  const offset = (page - 1) * pageSize;

  return {
    items: await listResourceListViewModels(
      mergedItems.slice(offset, offset + pageSize),
    ),
    pageInfo: {
      page,
      pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / pageSize),
    },
  };
}

async function toResourceListViewModelResponse(
  response: ResourceListResult,
): Promise<ResourceListViewModelResponse> {
  return {
    items: await listResourceListViewModels(toResourceItems(response)),
    pageInfo: toResourcePageInfo(response),
  };
}

function toAuditEventViewModelListResponse(
  response: AuditEventListResult,
  resourceMap: Map<number, Resource>,
  environmentMap: Map<number, string>,
): AuditEventViewModelListResponse {
  return {
    items: toAuditEventViewModels(
      toAuditEventItems(response),
      resourceMap,
      environmentMap,
    ),
    pageInfo: toAuditEventPageInfo(response),
  };
}

function normalizeResourceProfile(
  profile: ResourceProfileResponse["profile"] | undefined,
): Record<string, string> {
  if (!profile) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(profile)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

function toResourceListViewModel(
  resource: Resource,
  {
    environmentMap,
    ownerMap,
  }: Awaited<ReturnType<typeof buildListLookupMaps>>,
): ResourceListViewModel {
  return {
    ...resource,
    environmentName:
      environmentMap.get(resource.environmentId) ?? String(resource.environmentId),
    ownerName: ownerMap.get(resource.ownerId) ?? String(resource.ownerId),
    summary: buildFallbackSummary(resource),
    isArchived: resource.archivedAt !== null && resource.archivedAt !== undefined,
  };
}

async function toResourceDetailViewModel(
  resource: Resource,
  inlineMembers?: ClusterMember[],
): Promise<ResourceDetailViewModel> {
  const isDatabase = resource.resourceType === "database_cluster" ||
    resource.resourceType === "database_instance";

  const [
    { resourceMap, environmentMap, ownerMap },
    relations,
    auditEvents,
    profileResponse,
    fetchedMembers,
  ] = await Promise.all([
    buildLookupMaps(),
    listResourceRelations(resource.id),
    listResourceAuditEvents(resource.id),
    getResourceProfileById(resource.id),
    resource.resourceType === "database_cluster"
      ? listClusterMembers(resource.id)
      : Promise.resolve(undefined),
  ]);

  const members = fetchedMembers ?? inlineMembers;
  const clusterResource = resource.resourceType === "database_instance" && resource.clusterId
    ? resourceMap.get(resource.clusterId)
    : undefined;

  const auditViewModels = auditEvents.map((event) =>
    toAuditEventViewModel(event, resourceMap, environmentMap),
  );

  return {
    ...toResourceListViewModel(resource, { environmentMap, ownerMap }),
    profile: normalizeResourceProfile(profileResponse?.profile),
    relations: relations.map((relation) =>
      toRelationViewModel(relation, resource.id, resourceMap),
    ),
    auditEvents: auditViewModels,
    ...(isDatabase ? { recentAudits: auditViewModels.slice(0, 5) } : {}),
    ...(members && members.length > 0 ? { members } : {}),
    ...(clusterResource ? {
      clusterInfo: {
        id: clusterResource.id,
        displayName: clusterResource.displayName,
        healthStatus: clusterResource.healthStatus,
        lifecycleStatus: clusterResource.lifecycleStatus,
      },
    } : {}),
  };
}

async function listResourceListViewModels(
  resources: Resource[],
): Promise<ResourceListViewModel[]> {
  const lookupMaps = await buildListLookupMaps();

  return resources.map((resource) => toResourceListViewModel(resource, lookupMaps));
}

export async function listResourceViewModels(): Promise<ResourceListViewModel[]>;
export async function listResourceViewModels(
  params: ResourceListParams,
): Promise<ResourceListViewModelResponse>;
export async function listResourceViewModels(
  params?: ResourceListParams,
): Promise<ResourceListViewModel[] | ResourceListViewModelResponse> {
  if (params === undefined) {
    const response = (await listResources({})) as ResourceListResult;
    return listResourceListViewModels(toResourceItems(response));
  }

  const response = (await listResources(params)) as ResourceListResult;

  return toResourceListViewModelResponse(response);
}

export async function listDatabaseResourceViewModels(): Promise<
  ResourceListViewModel[]
>;
export async function listDatabaseResourceViewModels(
  params: ResourceListParams,
): Promise<ResourceListViewModelResponse>;
export async function listDatabaseResourceViewModels(
  params?: ResourceListParams,
): Promise<ResourceListViewModel[] | ResourceListViewModelResponse> {
  if (params === undefined) {
    const resources = await listDatabaseResources();

    return listResourceListViewModels(resources);
  }

  return listPaginatedResourcesByTypes(params, [
    "database_instance",
    "database_cluster",
  ]);
}

export async function listAttentionResourceViewModels(): Promise<
  ResourceListViewModel[]
> {
  const resources = await listAttentionResources();

  return listResourceListViewModels(resources);
}

export async function getResourceViewModel(
  resourceId: number,
): Promise<ResourceDetailViewModel | null> {
  const detailResponse = await getResourceById(resourceId);

  if (!detailResponse) {
    return null;
  }

  // Handle both wrapped { resource, members } and flat Resource responses
  const resource =
    "resource" in detailResponse
      ? (detailResponse as ResourceDetailResponse).resource
      : (detailResponse as unknown as Resource);
  const members =
    "members" in detailResponse
      ? (detailResponse as ResourceDetailResponse).members
      : undefined;

  return toResourceDetailViewModel(resource, members);
}

export async function listAuditEventViewModels(): Promise<AuditEventViewModel[]>;
export async function listAuditEventViewModels(
  params: AuditEventListParams,
): Promise<AuditEventViewModelListResponse>;
export async function listAuditEventViewModels(
  params?: AuditEventListParams,
): Promise<AuditEventViewModel[] | AuditEventViewModelListResponse> {
  const [{ resourceMap, environmentMap }, response] = await Promise.all([
    buildLookupMaps(),
    listAuditEvents(params ?? {}) as Promise<AuditEventListResult>,
  ]);

  if (params === undefined) {
    return toAuditEventViewModels(
      toAuditEventItems(response),
      resourceMap,
      environmentMap,
    );
  }

  return toAuditEventViewModelListResponse(
    response,
    resourceMap,
    environmentMap,
  );
}

export async function listRecentAuditEventViewModels(
  limit = 5,
): Promise<AuditEventViewModel[]> {
  const [{ resourceMap, environmentMap }, events] = await Promise.all([
    buildLookupMaps(),
    listRecentAuditEvents(limit),
  ]);

  return toAuditEventViewModels(events, resourceMap, environmentMap);
}

export { getOverviewMetrics };
