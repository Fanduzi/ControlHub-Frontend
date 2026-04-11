import type {
  Resource,
  ResourceListResponse,
  ResourceRelation,
  ResourceRelationListResponse,
} from "@/types/resource";

const resourcesResponse: ResourceListResponse = {
  items: [
    {
      id: "res-host-bastion",
      resourceType: "host",
      resourceSubtype: "linux_vm",
      name: "edge-bastion-01",
      displayName: "Edge Bastion 01",
      environmentId: "env-prod",
      ownerId: "owner-platform",
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
      externalId: "vmw:cluster-a:host-17",
      labels: {
        team: "platform",
        tier: "0",
      },
      createdAt: "2026-04-10T08:30:00Z",
      updatedAt: "2026-04-11T03:14:00Z",
    },
    {
      id: "res-db-cluster-orders",
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      name: "order-cluster-prod",
      displayName: "Order Cluster Prod",
      environmentId: "env-prod",
      ownerId: "owner-dba",
      lifecycleStatus: "running",
      healthStatus: "warning",
      source: "manual",
      externalId: "aws:rds:cluster:order-prod",
      labels: {
        team: "order",
        criticality: "tier1",
      },
      createdAt: "2026-04-09T01:20:00Z",
      updatedAt: "2026-04-11T13:00:00Z",
    },
    {
      id: "res-db-primary",
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      name: "order-mysql-prod",
      displayName: "Order MySQL Prod",
      environmentId: "env-prod",
      ownerId: "owner-dba",
      lifecycleStatus: "running",
      healthStatus: "degraded",
      source: "manual",
      externalId: "aws:rds:order-primary",
      labels: {
        team: "order",
        role: "primary",
      },
      createdAt: "2026-04-11T12:00:00Z",
      updatedAt: "2026-04-11T20:00:00Z",
    },
    {
      id: "res-db-replica",
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      name: "order-mysql-replica",
      displayName: "Order MySQL Replica",
      environmentId: "env-prod",
      ownerId: "owner-dba",
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
      externalId: "aws:rds:order-replica",
      labels: {
        team: "order",
        role: "replica",
      },
      createdAt: "2026-04-11T12:05:00Z",
      updatedAt: "2026-04-11T20:03:00Z",
    },
    {
      id: "res-service-checkout",
      resourceType: "service",
      resourceSubtype: "go_api",
      name: "checkout-api",
      displayName: "Checkout API",
      environmentId: "env-prod",
      ownerId: "owner-platform",
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
      externalId: "k8s:prod:checkout-api",
      labels: {
        team: "order",
        system: "checkout",
      },
      createdAt: "2026-04-09T06:20:00Z",
      updatedAt: "2026-04-11T11:42:00Z",
    },
    {
      id: "res-service-inventory",
      resourceType: "service",
      resourceSubtype: "worker",
      name: "inventory-sync",
      displayName: "Inventory Sync",
      environmentId: "env-staging",
      ownerId: "owner-supply",
      lifecycleStatus: "pending",
      healthStatus: "warning",
      source: "manual",
      externalId: "k8s:staging:inventory-sync",
      labels: {
        team: "supply",
        workload: "sync",
      },
      createdAt: "2026-04-10T16:15:00Z",
      updatedAt: "2026-04-11T09:10:00Z",
    },
  ],
};

const relations: ResourceRelation[] = [
  {
    id: "rel-1",
    fromResourceId: "res-service-checkout",
    toResourceId: "res-db-primary",
    relationType: "depends_on",
    createdAt: "2026-04-11T21:00:00Z",
  },
  {
    id: "rel-2",
    fromResourceId: "res-db-primary",
    toResourceId: "res-db-cluster-orders",
    relationType: "member_of",
    createdAt: "2026-04-11T21:05:00Z",
  },
  {
    id: "rel-3",
    fromResourceId: "res-db-replica",
    toResourceId: "res-db-cluster-orders",
    relationType: "member_of",
    createdAt: "2026-04-11T21:06:00Z",
  },
  {
    id: "rel-4",
    fromResourceId: "res-service-inventory",
    toResourceId: "res-db-replica",
    relationType: "depends_on",
    createdAt: "2026-04-11T21:08:00Z",
  },
  {
    id: "rel-5",
    fromResourceId: "res-service-checkout",
    toResourceId: "res-host-bastion",
    relationType: "operated_via",
    createdAt: "2026-04-11T21:09:00Z",
  },
];

export async function listResources(): Promise<Resource[]> {
  return resourcesResponse.items;
}

export async function getResourceById(id: string): Promise<Resource | null> {
  return resourcesResponse.items.find((resource) => resource.id === id) ?? null;
}

export async function listResourceRelations(
  resourceId: string,
): Promise<ResourceRelation[]> {
  const response: ResourceRelationListResponse = {
    items: relations.filter(
      (relation) =>
        relation.fromResourceId === resourceId || relation.toResourceId === resourceId,
    ),
  };

  return response.items;
}

export async function listDatabaseResources(): Promise<Resource[]> {
  return resourcesResponse.items.filter((resource) =>
    ["database_instance", "database_cluster"].includes(resource.resourceType),
  );
}

export async function listAttentionResources(): Promise<Resource[]> {
  return resourcesResponse.items.filter(
    (resource) =>
      resource.healthStatus !== "healthy" || resource.lifecycleStatus !== "running",
  );
}

export async function getOverviewMetrics() {
  const total = resourcesResponse.items.length;
  const degraded = resourcesResponse.items.filter(
    (resource) => resource.healthStatus === "degraded",
  ).length;
  const warning = resourcesResponse.items.filter(
    (resource) => resource.healthStatus === "warning",
  ).length;
  const pending = resourcesResponse.items.filter(
    (resource) => resource.lifecycleStatus !== "running",
  ).length;

  return {
    total,
    degraded,
    warning,
    pending,
  };
}
