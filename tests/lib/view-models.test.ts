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
  listAttentionResources,
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
  getResourceById: vi.fn(),
  getResourceProfileById: vi.fn(),
  listResourceRelations: vi.fn(),
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
const mockedListEnvironments = vi.mocked(listEnvironments);
const mockedListOwners = vi.mocked(listOwners);
const mockedListResourceAuditEvents = vi.mocked(listResourceAuditEvents);
const mockedListAuditEvents = vi.mocked(listAuditEvents);

const resource = {
  id: "40000000-0000-0000-0000-000000000002",
  resourceType: "database_instance" as const,
  resourceSubtype: "mysql",
  name: "orders-db-primary",
  displayName: "Orders DB Primary",
  environmentId: "env-prod",
  ownerId: "owner-dba",
  lifecycleStatus: "running",
  healthStatus: "degraded",
  source: "manual",
  externalId: "mysql:prod:orders-primary",
  labels: {
    tier: "critical",
  },
  createdAt: "2026-04-12T12:00:00Z",
  updatedAt: "2026-04-12T13:00:00Z",
};

describe("getResourceViewModel", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockedGetResourceById.mockResolvedValue(resource);
    mockedListResources.mockResolvedValue([resource] as never);
    mockedListEnvironments.mockResolvedValue([
      {
        id: "env-prod",
        name: "Production",
        slug: "production",
        description: "Production environment",
        createdAt: "2026-04-12T12:00:00Z",
      },
    ]);
    mockedListOwners.mockResolvedValue([
      {
        id: "owner-dba",
        name: "DBA Team",
        email: "dba@example.com",
        createdAt: "2026-04-12T12:00:00Z",
      },
    ]);
    mockedListResourceRelations.mockResolvedValue([]);
    mockedListResourceAuditEvents.mockResolvedValue([]);

    vi.mocked(listAuditEvents).mockResolvedValue([] as never);
    vi.mocked(listRecentAuditEvents).mockResolvedValue([]);
    vi.mocked(listAttentionResources).mockResolvedValue([]);
    vi.mocked(listDatabaseResources).mockResolvedValue([]);
    vi.mocked(getOverviewMetrics).mockResolvedValue({
      total: 1,
      degraded: 1,
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
    expect(viewModel?.summary).toBe(
      "Primary transactional database instance handling order placement, payment finalization, and write-heavy checkout paths.",
    );
    expect(viewModel?.profile).toEqual({
      engine: "postgres",
      version: "16",
      host: "backend-db-01.internal",
      port: "5432",
      readOnly: "false",
    });
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
      },
    });

    const result = await listResourceViewModels({ page: 2, pageSize: 10 });

    expect(result.pageInfo).toEqual({
      page: 2,
      pageSize: 10,
      totalItems: 64,
      totalPages: 7,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].displayName).toBe("Orders DB Primary");
  });

  it("composes exact backend database type pages for paginated database view models", async () => {
    const firstInstance = {
      ...resource,
      id: "db-instance-a",
      name: "a-instance",
      displayName: "A Instance",
    };
    const secondInstance = {
      ...resource,
      id: "db-instance-d",
      name: "d-instance",
      displayName: "D Instance",
    };
    const firstCluster = {
      ...resource,
      id: "db-cluster-b",
      resourceType: "database_cluster" as const,
      resourceSubtype: "mysql_cluster",
      name: "b-cluster",
      displayName: "B Cluster",
    };
    const secondCluster = {
      ...firstCluster,
      id: "db-cluster-c",
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
        },
      })
      .mockResolvedValueOnce({
        items: [firstCluster, secondCluster],
        pageInfo: {
          page: 1,
          pageSize: 4,
          totalItems: 2,
          totalPages: 1,
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
    expect(result.pageInfo).toEqual({
      page: 2,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
    });
    expect(result.items.map((item) => item.displayName)).toEqual([
      "C Cluster",
      "D Instance",
    ]);
  });

  it("preserves pageInfo when listing audit event view models", async () => {
    mockedListAuditEvents.mockResolvedValue({
      items: [
        {
          id: "audit-1",
          actorUserId: "30000000-0000-0000-0000-000000000001",
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
      },
    });

    const result = await listAuditEventViewModels({ page: 3, pageSize: 5 });

    expect(result.pageInfo).toEqual({
      page: 3,
      pageSize: 5,
      totalItems: 21,
      totalPages: 5,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].targetResourceName).toBe("Orders DB Primary");
  });
});
