import { formatLabel } from "@/lib/format";
import { listRecentAuditEvents, listAuditEvents, listResourceAuditEvents } from "@/services/audits";
import { listEnvironments, listOwners } from "@/services/settings";
import {
  getOverviewMetrics,
  getResourceById,
  listAttentionResources,
  listDatabaseResources,
  listResourceRelations,
  listResources,
} from "@/services/resources";
import type { AuditEvent } from "@/types/audit";
import type { Resource, ResourceRelation } from "@/types/resource";
import type {
  AuditEventViewModel,
  ResourceRelationViewModel,
  ResourceViewModel,
} from "@/types/view-models";

const resourceDetails: Record<
  string,
  {
    summary: string;
    profile: Record<string, string>;
  }
> = {
  "res-host-bastion": {
    summary:
      "Hardened bastion host used for controlled break-glass access and operator maintenance tunnels.",
    profile: {
      region: "ap-southeast-1",
      provider: "VMware",
      address: "10.10.8.14",
    },
  },
  "res-db-cluster-orders": {
    summary:
      "Logical MySQL cluster boundary for the order domain, grouping writer and replica resources.",
    profile: {
      engine: "MySQL 8.0",
      topology: "single-writer",
      region: "ap-southeast-1",
    },
  },
  "res-db-primary": {
    summary:
      "Primary transactional database handling order placement, payment finalization, and write-heavy checkout paths.",
    profile: {
      engine: "MySQL 8.0",
      endpoint: "order-primary.internal:3306",
      region: "ap-southeast-1",
    },
  },
  "res-db-replica": {
    summary:
      "Read replica supporting reporting queries and lower-priority operational traffic.",
    profile: {
      engine: "MySQL 8.0",
      endpoint: "order-replica.internal:3306",
      region: "ap-southeast-1",
    },
  },
  "res-service-checkout": {
    summary:
      "Customer-facing checkout service with direct dependency on the order data plane.",
    profile: {
      runtime: "Go 1.24",
      namespace: "payments",
      repo: "github.com/fan/controlhub-checkout",
    },
  },
  "res-service-inventory": {
    summary:
      "Inventory reconciliation worker awaiting production promotion and relation confirmation.",
    profile: {
      runtime: "Node.js 24",
      namespace: "supply",
      repo: "github.com/fan/inventory-sync",
    },
  },
};

const actorLabels: Record<string, string> = {
  "user-admin": "Admin User",
  "user-editor": "Editor User",
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

function toRelationViewModel(
  relation: ResourceRelation,
  currentResourceId: string,
  resourceMap: Map<string, Resource>,
): ResourceRelationViewModel {
  const outgoing = relation.fromResourceId === currentResourceId;
  const relatedResourceId = outgoing ? relation.toResourceId : relation.fromResourceId;

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
    actorLabel: actorLabels[event.actorUserId] ?? fallbackLabel(event.actorUserId),
    targetResourceName: target?.displayName ?? event.targetResourceId,
    environmentLabel: target
      ? (environmentMap.get(target.environmentId) ?? target.environmentId)
      : "Unknown",
    summary: buildAuditSummary(event),
  };
}

async function toResourceViewModel(resource: Resource): Promise<ResourceViewModel> {
  const [{ resourceMap, environmentMap, ownerMap }, relations, auditEvents] =
    await Promise.all([
      buildLookupMaps(),
      listResourceRelations(resource.id),
      listResourceAuditEvents(resource.id),
    ]);

  return {
    ...resource,
    environmentName:
      environmentMap.get(resource.environmentId) ?? resource.environmentId,
    ownerName: ownerMap.get(resource.ownerId) ?? resource.ownerId,
    summary:
      resourceDetails[resource.id]?.summary ??
      "No supplemental resource summary has been defined yet.",
    profile: resourceDetails[resource.id]?.profile ?? {},
    relations: relations.map((relation) =>
      toRelationViewModel(relation, resource.id, resourceMap),
    ),
    auditEvents: auditEvents.map((event) =>
      toAuditEventViewModel(event, resourceMap, environmentMap),
    ),
  };
}

export async function listResourceViewModels(): Promise<ResourceViewModel[]> {
  const resources = await listResources();

  return Promise.all(resources.map((resource) => toResourceViewModel(resource)));
}

export async function listDatabaseResourceViewModels(): Promise<ResourceViewModel[]> {
  const resources = await listDatabaseResources();

  return Promise.all(resources.map((resource) => toResourceViewModel(resource)));
}

export async function listAttentionResourceViewModels(): Promise<ResourceViewModel[]> {
  const resources = await listAttentionResources();

  return Promise.all(resources.map((resource) => toResourceViewModel(resource)));
}

export async function getResourceViewModel(
  resourceId: string,
): Promise<ResourceViewModel | null> {
  const resource = await getResourceById(resourceId);

  if (!resource) {
    return null;
  }

  return toResourceViewModel(resource);
}

export async function listAuditEventViewModels(): Promise<AuditEventViewModel[]> {
  const [{ resourceMap, environmentMap }, events] = await Promise.all([
    buildLookupMaps(),
    listAuditEvents(),
  ]);

  return events.map((event) => toAuditEventViewModel(event, resourceMap, environmentMap));
}

export async function listRecentAuditEventViewModels(
  limit = 5,
): Promise<AuditEventViewModel[]> {
  const [{ resourceMap, environmentMap }, events] = await Promise.all([
    buildLookupMaps(),
    listRecentAuditEvents(limit),
  ]);

  return events.map((event) => toAuditEventViewModel(event, resourceMap, environmentMap));
}

export { getOverviewMetrics };
