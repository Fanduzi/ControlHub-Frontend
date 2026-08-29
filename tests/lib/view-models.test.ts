// input: Vitest, mocked resource/settings services, and view-model contracts
// output: resource and database view-model composition, parent-cluster resolution, and scoped paginated-list regression coverage
// pos: library contract coverage for frontend view-model adapters
// note: if this file changes, update this header and tests/lib/README.md
import {
  getResourceViewModel,
  listAuditEventViewModels,
  listDatabaseResourceViewModels,
  listResourceViewModels,
} from "@/lib/view-models";
import {
  getResourceById,
  getResourceProfileById,
  getOverviewMetrics,
  listAllResources,
  listAttentionResources,
  listClusterMembers,
  listDatabaseResources,
  listResourceRelations,
  listResources,
} from "@/services/resources";
import {
  listAuditEvents,
  listRecentAuditEvents,
  listResourceAuditEvents,
} from "@/services/audits";
import { listEnvironments, listOwners } from "@/services/settings";

vi.mock("@/services/resources", () => ({
  listResources: vi.fn(),
  listAllResources: vi.fn(),
  getResourceById: vi.fn(),
  getResourceProfileById: vi.fn(),
  listResourceRelations: vi.fn(),
  listClusterMembers: vi.fn(),
  listDatabaseResources: vi.fn(),
  listAttentionResources: vi.fn(),
  getOverviewMetrics: vi.fn(),
}));

vi.mock("@/services/audits", () => ({
  listAuditEvents: vi.fn(),
  listRecentAuditEvents: vi.fn(),
  listResourceAuditEvents: vi.fn(),
}));

vi.mock("@/services/settings", () => ({
  listEnvironments: vi.fn(),
  listOwners: vi.fn(),
}));

const mockedGetResourceById = vi.mocked(getResourceById);
const mockedGetResourceProfileById = vi.mocked(getResourceProfileById);
const mockedListResourceRelations = vi.mocked(listResourceRelations);
const mockedListResources = vi.mocked(listResources);
const mockedListAllResources = vi.mocked(listAllResources);
const mockedListEnvironments = vi.mocked(listEnvironments);
const mockedListOwners = vi.mocked(listOwners);
const mockedListResourceAuditEvents = vi.mocked(listResourceAuditEvents);
const mockedListAuditEvents = vi.mocked(listAuditEvents);

const resource = {
  id: 2,
  resourceType: "database_instance" as const,
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: 1,
  ownerId: 1,
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "mysql:prod:orders-primary",
  labels: {
    tier: "critical",
  },
  createdAt: "2026-04-12T12:00:00Z",
  updatedAt: "2026-04-12T13:00:00Z",
  archivedAt: null,
  archivedBy: null,
  archiveReason: null,
};

describe("getResourceViewModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedGetResourceById.mockResolvedValue({ resource });
    mockedListResources.mockResolvedValue([resource] as never);
    mockedListAllResources.mockResolvedValue([resource] as never);
    mockedListEnvironments.mockResolvedValue([
      {
        id: 1,
        name: "Production",
        slug: "production",
        description: "Production environment",
        createdAt: "2026-04-12T12:00:00Z",
      },
    ]);
    mockedListOwners.mockResolvedValue([
      {
        id: 1,
        name: "DBA Team",
        email: "dba@example.com",
        createdAt: "2026-04-12T12:00:00Z",
      },
    ]);
    mockedListResourceRelations.mockResolvedValue([]);
    mockedListResourceAuditEvents.mockResolvedValue([]);
    vi.mocked(listClusterMembers).mockResolvedValue([]);

    vi.mocked(listAuditEvents).mockResolvedValue([] as never);
    vi.mocked(listRecentAuditEvents).mockResolvedValue([]);
    vi.mocked(listAttentionResources).mockResolvedValue([]);
    vi.mocked(listDatabaseResources).mockResolvedValue([]);
    vi.mocked(getOverviewMetrics).mockResolvedValue({
      total: 1,
      critical: 1,
      warning: 0,
      pending: 0,
    });
  });

  it("uses the backend profile projection instead of the legacy static profile map", async () => {
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: resource.id,
      resourceType: resource.resourceType,
      resourceSubtype: resource.resourceSubtype,
      profile: {
        engine: "postgres",
        version: 16,
        host: "backend-db-01.internal",
        port: 5432,
        readOnly: false,
        optionalReplica: null,
      },
    });

    const viewModel = await getResourceViewModel(resource.id);

    expect(mockedGetResourceProfileById).toHaveBeenCalledWith(resource.id);
    expect(viewModel?.summary).toBe("database_instance · mysql · running");
    expect(viewModel?.profile).toEqual({
      engine: "postgres",
      version: "16",
      host: "backend-db-01.internal",
      port: "5432",
      readOnly: "false",
    });
  });

  it("does not generate title-cased English fallback summaries for resources without curated copy", async () => {
    const uncopiedResource = {
      ...resource,
      id: 99,
      resourceType: "database_cluster" as const,
      resourceSubtype: "mysql",
      lifecycleStatus: "running",
      displayName: "Payment MySQL Cluster",
    };
    mockedGetResourceById.mockResolvedValue({ resource: uncopiedResource });
    mockedListResources.mockResolvedValue([uncopiedResource] as never);

    const viewModel = await getResourceViewModel(uncopiedResource.id);

    expect(viewModel?.summary).toBe("database_cluster · mysql · running");
    expect(viewModel?.summary).not.toContain("Database Cluster");
    expect(viewModel?.summary).not.toContain("Running");
  });

  it("keeps the profile empty when the backend projection has no populated fields", async () => {
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: resource.id,
      resourceType: resource.resourceType,
      resourceSubtype: resource.resourceSubtype,
      profile: {
        host: null,
      },
    });

    const viewModel = await getResourceViewModel(resource.id);

    expect(viewModel?.profile).toEqual({});
  });

  it("uses one valid outgoing member_of relation as the database instance parent when clusterId is absent", async () => {
    const cluster = {
      ...resource,
      id: 14,
      resourceType: "database_cluster" as const,
      displayName: "Orders DB Cluster",
    };
    mockedGetResourceById.mockResolvedValue({ resource: { ...resource, clusterId: null } });
    mockedListAllResources.mockResolvedValue([resource, cluster] as never);
    mockedListResourceRelations.mockResolvedValue([{
      id: 1,
      fromResourceId: resource.id,
      toResourceId: cluster.id,
      relationType: "member_of",
      createdAt: "2026-04-12T12:00:00Z",
    }]);

    const viewModel = await getResourceViewModel(resource.id);

    expect(viewModel?.clusterInfo).toMatchObject({
      id: cluster.id,
      displayName: "Orders DB Cluster",
    });
  });

  it("keeps explicit clusterId authoritative while retaining a conflicting relation", async () => {
    const explicitCluster = {
      ...resource,
      id: 14,
      resourceType: "database_cluster" as const,
      displayName: "Explicit cluster",
    };
    const relatedCluster = {
      ...explicitCluster,
      id: 15,
      displayName: "Related cluster",
    };
    mockedGetResourceById.mockResolvedValue({ resource: { ...resource, clusterId: explicitCluster.id } });
    mockedListAllResources.mockResolvedValue([resource, explicitCluster, relatedCluster] as never);
    mockedListResourceRelations.mockResolvedValue([{
      id: 1,
      fromResourceId: resource.id,
      toResourceId: relatedCluster.id,
      relationType: "member_of",
      createdAt: "2026-04-12T12:00:00Z",
    }]);

    const viewModel = await getResourceViewModel(resource.id);

    expect(viewModel?.clusterInfo?.id).toBe(explicitCluster.id);
    expect(viewModel?.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ toResourceId: relatedCluster.id }),
    ]));
  });

  it.each([
    ["incoming relation", { fromResourceId: 14, toResourceId: resource.id, relationType: "member_of" }],
    ["wrong target type", { fromResourceId: resource.id, toResourceId: 15, relationType: "member_of" }],
    ["multiple cluster relations", [
      { fromResourceId: resource.id, toResourceId: 14, relationType: "member_of" },
      { fromResourceId: resource.id, toResourceId: 16, relationType: "member_of" },
    ]],
  ])("does not guess a cluster parent from %s", async (_caseName, relationOrRelations) => {
    const cluster = {
      ...resource,
      id: 14,
      resourceType: "database_cluster" as const,
    };
    const host = { ...resource, id: 15, resourceType: "host" as const };
    const secondCluster = { ...cluster, id: 16 };
    const relations = (Array.isArray(relationOrRelations) ? relationOrRelations : [relationOrRelations]).map(
      (relation, index) => ({ id: index + 1, createdAt: "2026-04-12T12:00:00Z", ...relation }),
    );
    mockedGetResourceById.mockResolvedValue({ resource: { ...resource, clusterId: null } });
    mockedListAllResources.mockResolvedValue([resource, cluster, host, secondCluster] as never);
    mockedListResourceRelations.mockResolvedValue(relations);

    const viewModel = await getResourceViewModel(resource.id);

    expect(viewModel?.clusterInfo).toBeUndefined();
  });

  it("builds list view models without issuing per-resource profile fetches", async () => {
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: resource.id,
      resourceType: resource.resourceType,
      resourceSubtype: resource.resourceSubtype,
      profile: {
        engine: "postgres",
      },
    });

    const viewModels = await listResourceViewModels();

    expect(mockedGetResourceProfileById).not.toHaveBeenCalled();
    expect(viewModels).toHaveLength(1);
    expect(viewModels[0]).not.toHaveProperty("profile");
  });

  it("keeps database list fallbacks without issuing profile fetches", async () => {
    vi.mocked(listDatabaseResources).mockResolvedValue([resource]);
    mockedGetResourceProfileById.mockResolvedValue({
      resourceId: resource.id,
      resourceType: resource.resourceType,
      resourceSubtype: resource.resourceSubtype,
      profile: {
        engine: "postgres",
        primaryEndpoint: "orders-db.internal:5432",
      },
    });

    const viewModels = await listDatabaseResourceViewModels();

    expect(mockedGetResourceProfileById).not.toHaveBeenCalled();
    expect(viewModels).toHaveLength(1);
    expect(viewModels[0]).not.toHaveProperty("profile");
  });

  it("preserves pageInfo when listing resource view models", async () => {
    mockedListResources.mockResolvedValue({
      items: [resource],
      pageInfo: {
        page: 2,
        pageSize: 10,
        totalItems: 64,
        totalPages: 7,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    const result = await listResourceViewModels({ page: 2, pageSize: 10 });

    expect(result.pageInfo).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 64,
      totalPages: 7,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].displayName).toBe("Orders DB Primary");
  });

  it("passes through resolved environment ids for resource lists", async () => {
    mockedListResources.mockResolvedValue({
      items: [resource],
      pageInfo: {
        page: 1,
        pageSize: 15,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    });

    await listResourceViewModels({ environmentId: 1, page: 1, pageSize: 15 });

    expect(mockedListResources).toHaveBeenCalledWith({
      environmentId: 1,
      page: 1,
      pageSize: 15,
    });
  });

  it("composes exact backend database type pages for paginated database view models", async () => {
    const firstInstance = {
      ...resource,
      id: 201,
      name: "a-instance",
      displayName: "A Instance",
    };
    const secondInstance = {
      ...resource,
      id: 204,
      name: "d-instance",
      displayName: "D Instance",
    };
    const firstCluster = {
      ...resource,
      id: 202,
      resourceType: "database_cluster" as const,
      resourceSubtype: "mysql_cluster",
      name: "b-cluster",
      displayName: "B Cluster",
    };
    const secondCluster = {
      ...firstCluster,
      id: 203,
      name: "c-cluster",
      displayName: "C Cluster",
    };

    mockedListResources
      .mockResolvedValueOnce({
        items: [firstInstance, secondInstance],
        pageInfo: {
          page: 1,
          pageSize: 4,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [firstCluster, secondCluster],
        pageInfo: {
          page: 1,
          pageSize: 4,
          totalItems: 2,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 4,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

    const result = await listDatabaseResourceViewModels({ page: 2, pageSize: 2 });

    expect(mockedListResources).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 4,
      resourceType: "database_instance",
    });
    expect(mockedListResources).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 4,
      resourceType: "database_cluster",
    });
    expect(mockedListResources).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 4,
      resourceType: "database_proxy",
    });
    expect(result.pageInfo).toEqual({
      page: 2,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    });
    expect(result.items.map((item) => item.displayName)).toEqual([
      "C Cluster",
      "D Instance",
    ]);
  });

  it("does not truncate totalItems when backend returns fewer items than total", async () => {
    // Backend has 11 mysql instances total, but only returns 10 per page.
    // Frontend must NOT use items.length as totalItems.
    const instances = Array.from({ length: 10 }, (_, i) => ({
      ...resource,
      id: i + 300,
      name: `instance-${String(i).padStart(2, "0")}`,
      displayName: `Instance ${String(i).padStart(2, "0")}`,
      resourceSubtype: "mysql",
    }));

    mockedListResources
      .mockResolvedValueOnce({
        items: instances,
        pageInfo: {
          page: 1,
          pageSize: 10,
          totalItems: 11,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 10,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

    const result = await listDatabaseResourceViewModels({
      page: 1,
      pageSize: 10,
      resourceSubtype: "mysql",
      environmentId: 42,
      q: "db-201",
    });

    // Must use backend's totalItems, not items.length
    expect(result.pageInfo.totalItems).toBe(11);
    expect(result.pageInfo.totalPages).toBe(2);
    expect(result.items).toHaveLength(10);
  });

  it("passes resourceSubtype to backend and uses backend pageInfo for merged types", async () => {
    const instance = { ...resource, id: 401, resourceSubtype: "mysql" };
    const cluster = {
      ...resource,
      id: 402,
      resourceType: "database_cluster" as const,
      resourceSubtype: "mysql",
    };

    mockedListResources
      .mockResolvedValueOnce({
        items: [instance],
        pageInfo: {
          page: 1,
          pageSize: 20,
          totalItems: 7,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [cluster],
        pageInfo: {
          page: 1,
          pageSize: 20,
          totalItems: 3,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      })
      .mockResolvedValueOnce({
        items: [],
        pageInfo: {
          page: 1,
          pageSize: 20,
          totalItems: 0,
          totalPages: 0,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });

    const result = await listDatabaseResourceViewModels({
      page: 1,
      pageSize: 10,
      resourceSubtype: "mysql",
      environmentId: 42,
      q: "db-201",
    });

    // resourceSubtype is passed to both backend calls
    expect(mockedListResources).toHaveBeenNthCalledWith(1, {
      page: 1,
      pageSize: 10,
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      environmentId: 42,
      q: "db-201",
    });
    expect(mockedListResources).toHaveBeenNthCalledWith(2, {
      page: 1,
      pageSize: 10,
      resourceType: "database_cluster",
      resourceSubtype: "mysql",
      environmentId: 42,
      q: "db-201",
    });
    expect(mockedListResources).toHaveBeenNthCalledWith(3, {
      page: 1,
      pageSize: 10,
      resourceType: "database_proxy",
      resourceSubtype: "mysql",
      environmentId: 42,
      q: "db-201",
    });

    // totalItems = 7 + 3 = 10 (sum of backend totals, not items.length)
    expect(result.pageInfo.totalItems).toBe(10);
    expect(result.items).toHaveLength(2);
  });

  it("preserves pageInfo when listing audit event view models", async () => {
    mockedListAuditEvents.mockResolvedValue({
      items: [
        {
          id: 1,
          actorUserId: 1,
          targetResourceId: resource.id,
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-14T00:00:00Z",
        },
      ],
      pageInfo: {
        page: 3,
        pageSize: 5,
        totalItems: 21,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true,
      },
    });

    const result = await listAuditEventViewModels({ page: 3, pageSize: 5 });

    expect(result.pageInfo).toEqual({
      page: 3,
      pageSize: 5,
      totalItems: 21,
      totalPages: 5,
      hasNextPage: true,
      hasPreviousPage: true,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].targetResourceName).toBe("Orders DB Primary");
  });
});
