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
  listDatabaseResources,
  listResourceRelations,
  listResources,
} from "@/services/resources";
import type {
  AuditEvent,
  AuditEventListParams,
  AuditEventListResponse,
} from "@/types/audit";
import type {
  Resource,
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

const resourceSummaries: Record<string, string> = {
  "40000000-0000-0000-0000-000000000001":
    "Logical MySQL cluster boundary for the order domain, grouping writer and replica resources across the production data plane.",
  "40000000-0000-0000-0000-000000000002":
    "Primary transactional database instance handling order placement, payment finalization, and write-heavy checkout paths.",
  "40000000-0000-0000-0000-000000000003":
    "Customer-facing order service with direct dependency on the MySQL data plane for order lifecycle management.",
  "40000000-0000-0000-0000-000000000004":
    "Production database host providing compute and storage for the MySQL primary instance.",
};

const actorLabels: Record<string, string> = {
  "30000000-0000-0000-0000-000000000001": "ControlHub Admin",
  "30000000-0000-0000-0000-000000000002": "ControlHub Editor",
};

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

function fallbackLabel(id: string) {
  return id
    .split("-")
    .filter(Boolean)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
}

function buildAuditSummary(event: AuditEvent) {
  return `${formatLabel(event.eventType)} completed with ${formatLabel(event.result)} result.`;
}

async function buildLookupMaps() {
  const [resourceResponse, environments, owners] = await Promise.all([
    listResources() as Promise<ResourceListResult>,
    listEnvironments(),
    listOwners(),
  ]);
  const resources = toResourceItems(resourceResponse);

  return {
    resourceMap: new Map(resources.map((resource) => [resource.id, resource])),
    environmentMap: new Map(
      environments.map((environment) => [environment.id, environment.name]),
    ),
    ownerMap: new Map(owners.map((owner) => [owner.id, owner.name])),
  };
}

async function buildListLookupMaps() {
  const [environments, owners] = await Promise.all([
    listEnvironments(),
    listOwners(),
  ]);

  return {
    environmentMap: new Map(
      environments.map((environment) => [environment.id, environment.name]),
    ),
    ownerMap: new Map(owners.map((owner) => [owner.id, owner.name])),
  };
}

function toRelationViewModel(
  relation: ResourceRelation,
  currentResourceId: string,
  resourceMap: Map<string, Resource>,
): ResourceRelationViewModel {
  const outgoing = relation.fromResourceId === currentResourceId;
  const relatedResourceId = outgoing
    ? relation.toResourceId
    : relation.fromResourceId;

  return {
    ...relation,
    relatedResourceId,
    relatedResourceName:
      resourceMap.get(relatedResourceId)?.displayName ?? relatedResourceId,
    direction: outgoing ? "outgoing" : "incoming",
  };
}

function toAuditEventViewModel(
  event: AuditEvent,
  resourceMap: Map<string, Resource>,
  environmentMap: Map<string, string>,
): AuditEventViewModel {
  const target = resourceMap.get(event.targetResourceId);

  return {
    ...event,
    actorLabel:
      actorLabels[event.actorUserId] ?? fallbackLabel(event.actorUserId),
    targetResourceName: target?.displayName ?? event.targetResourceId,
    environmentLabel: target
      ? (environmentMap.get(target.environmentId) ?? target.environmentId)
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
  resourceMap: Map<string, Resource>,
  environmentMap: Map<string, string>,
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
  resourceMap: Map<string, Resource>,
  environmentMap: Map<string, string>,
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
      environmentMap.get(resource.environmentId) ?? resource.environmentId,
    ownerName: ownerMap.get(resource.ownerId) ?? resource.ownerId,
    summary: resourceSummaries[resource.id] ?? buildFallbackSummary(resource),
    isArchived: resource.archivedAt !== null && resource.archivedAt !== undefined,
  };
}

async function toResourceDetailViewModel(
  resource: Resource,
): Promise<ResourceDetailViewModel> {
  const [
    { resourceMap, environmentMap, ownerMap },
    relations,
    auditEvents,
    profileResponse,
  ] = await Promise.all([
    buildLookupMaps(),
    listResourceRelations(resource.id),
    listResourceAuditEvents(resource.id),
    getResourceProfileById(resource.id),
  ]);

  return {
    ...toResourceListViewModel(resource, { environmentMap, ownerMap }),
    profile: normalizeResourceProfile(profileResponse?.profile),
    relations: relations.map((relation) =>
      toRelationViewModel(relation, resource.id, resourceMap),
    ),
    auditEvents: auditEvents.map((event) =>
      toAuditEventViewModel(event, resourceMap, environmentMap),
    ),
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
  resourceId: string,
): Promise<ResourceDetailViewModel | null> {
  const resource = await getResourceById(resourceId);

  if (!resource) {
    return null;
  }

  return toResourceDetailViewModel(resource);
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
