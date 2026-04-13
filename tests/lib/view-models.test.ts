import {
  getResourceViewModel,
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
    mockedListResources.mockResolvedValue([resource]);
    mockedListEnvironments.mockResolvedValue([
      { id: "env-prod", name: "Production", createdAt: "2026-04-12T12:00:00Z" },
    ]);
    mockedListOwners.mockResolvedValue([
      { id: "owner-dba", name: "DBA Team", createdAt: "2026-04-12T12:00:00Z" },
    ]);
    mockedListResourceRelations.mockResolvedValue([]);
    mockedListResourceAuditEvents.mockResolvedValue([]);

    vi.mocked(listAuditEvents).mockResolvedValue([]);
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
});
