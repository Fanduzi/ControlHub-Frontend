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
import type { AuditEvent } from "@/types/audit";
import type {
  Resource,
  ResourceProfileResponse,
  ResourceRelation,
} from "@/types/resource";
import type {
  AuditEventViewModel,
  ResourceRelationViewModel,
  ResourceDetailViewModel,
  ResourceListViewModel,
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
  const [resources, environments, owners] = await Promise.all([
    listResources(),
    listEnvironments(),
    listOwners(),
  ]);

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
    summary:
      resourceSummaries[resource.id] ??
      "No supplemental resource summary has been defined yet.",
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

export async function listResourceViewModels(): Promise<ResourceListViewModel[]> {
  const resources = await listResources();

  return listResourceListViewModels(resources);
}

export async function listDatabaseResourceViewModels(): Promise<
  ResourceListViewModel[]
> {
  const resources = await listDatabaseResources();

  return listResourceListViewModels(resources);
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

export async function listAuditEventViewModels(): Promise<
  AuditEventViewModel[]
> {
  const [{ resourceMap, environmentMap }, events] = await Promise.all([
    buildLookupMaps(),
    listAuditEvents(),
  ]);

  return events.map((event) =>
    toAuditEventViewModel(event, resourceMap, environmentMap),
  );
}

export async function listRecentAuditEventViewModels(
  limit = 5,
): Promise<AuditEventViewModel[]> {
  const [{ resourceMap, environmentMap }, events] = await Promise.all([
    buildLookupMaps(),
    listRecentAuditEvents(limit),
  ]);

  return events.map((event) =>
    toAuditEventViewModel(event, resourceMap, environmentMap),
  );
}

export { getOverviewMetrics };
