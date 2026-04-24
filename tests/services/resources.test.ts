import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveResource,
  getOverviewMetrics,
  listAttentionResources,
  listDatabaseResources,
  listResources,
  unarchiveResource,
} from "@/services/resources";
import {
  createResource,
  createResourceRelation,
  deleteResourceRelation,
  updateResource,
} from "@/services/resources";
import type {
  CreateResourceInput,
  CreateResourceRelationInput,
  ResourceListResponse,
  UpdateResourceInput,
} from "@/types/resource";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
}));

vi.mock("@/services/api-client", () => ({
  apiClient: apiClientMock,
}));

describe("listResources", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards pagination and filter params and preserves pageInfo", async () => {
    const response: ResourceListResponse = {
      items: [
        {
          id: 1,
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      ],
      pageInfo: {
        page: 2,
        pageSize: 10,
        totalItems: 64,
        totalPages: 7,
      },
    };

    apiClientMock.mockResolvedValue(response);

    const result = await listResources({
      page: 2,
      pageSize: 10,
      resourceType: "database_instance",
      environmentId: 101,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      q: "orders",
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/resources?page=2&pageSize=10&resourceType=database_instance&environmentId=101&lifecycleStatus=running&healthStatus=healthy&q=orders",
    );
    expect(result.pageInfo).toEqual(response.pageInfo);
    expect(result.items).toHaveLength(1);
  });

  it("filters database resources from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
        {
          id: 2,
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: 101,
          ownerId: 202,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      },
    } satisfies ResourceListResponse);

    const result = await listDatabaseResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("filters attention resources from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
        {
          id: 2,
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: 101,
          ownerId: 202,
          lifecycleStatus: "stopped",
          healthStatus: "warning",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("derives overview metrics from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "degraded",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
        {
          id: 2,
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: 101,
          ownerId: 202,
          lifecycleStatus: "stopped",
          healthStatus: "warning",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 2,
        totalPages: 1,
      },
    } satisfies ResourceListResponse);

    const result = await getOverviewMetrics();

    expect(result).toEqual({
      total: 2,
      degraded: 1,
      warning: 1,
      pending: 1,
    });
  });

  it("aggregates database, attention, and overview metrics across all backend pages", async () => {
    apiClientMock
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1,
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 2,
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: 101,
            ownerId: 201,
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
            archivedAt: null,
            archivedBy: null,
            archiveReason: null,
          },
        ],
        pageInfo: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
        },
      } satisfies ResourceListResponse);

    await expect(listDatabaseResources()).resolves.toHaveLength(2);
    await expect(listAttentionResources()).resolves.toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
    await expect(getOverviewMetrics()).resolves.toEqual({
      total: 2,
      degraded: 0,
      warning: 1,
      pending: 1,
    });
  });
});

describe("createResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const createdResource = {
    id: 3,
    resourceType: "database_instance" as const,
    resourceSubtype: "mysql",
    name: "order-mysql-02-prod",
    displayName: "Order MySQL 02 Prod",
    environmentId: 101,
    ownerId: 201,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "order-mysql-02-prod",
    labels: { team: "order" },
    createdAt: "2026-04-14T12:00:00Z",
    updatedAt: "2026-04-14T12:00:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };

  it("sends POST /resources with correct payload", async () => {
    apiClientMock.mockResolvedValue(createdResource);

    const input: CreateResourceInput = {
      resourceType: "database_instance",
      resourceSubtype: "mysql",
      name: "order-mysql-02-prod",
      displayName: "Order MySQL 02 Prod",
      environmentId: 101,
      ownerId: 201,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
      externalId: "order-mysql-02-prod",
      labels: { team: "order" },
    };

    const result = await createResource(input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources", {
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(result.id).toBe(3);
    expect(result.name).toBe("order-mysql-02-prod");
  });

  it("propagates validation error from backend", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 400"),
    );

    const input: CreateResourceInput = {
      resourceType: "invalid_type",
      name: "test",
      displayName: "Test",
      environmentId: 101,
      ownerId: 201,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
    };

    await expect(createResource(input)).rejects.toThrow("Request failed: 400");
  });

  it("propagates duplicate conflict error", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 409"),
    );

    const input: CreateResourceInput = {
      resourceType: "database_instance",
      name: "duplicate-name",
      displayName: "Duplicate",
      environmentId: 101,
      ownerId: 201,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      source: "manual",
    };

    await expect(createResource(input)).rejects.toThrow("Request failed: 409");
  });
});

describe("updateResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const updatedResource = {
    id: 1,
    resourceType: "database_instance" as const,
    resourceSubtype: "mysql",
    name: "orders-db-primary",
    displayName: "Orders DB Primary (Updated)",
    environmentId: 101,
    ownerId: 201,
    lifecycleStatus: "running",
    healthStatus: "warning",
    source: "manual",
    externalId: "mysql:prod:orders-primary",
    labels: { team: "order" },
    createdAt: "2026-04-14T00:00:00Z",
    updatedAt: "2026-04-14T12:00:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };

  it("sends PATCH /resources/{id} with partial payload", async () => {
    apiClientMock.mockResolvedValue(updatedResource);

    const input: UpdateResourceInput = {
      displayName: "Orders DB Primary (Updated)",
      healthStatus: "warning",
    };

    const result = await updateResource(1, input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1", {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    expect(result.displayName).toBe("Orders DB Primary (Updated)");
    expect(result.healthStatus).toBe("warning");
  });

  it("propagates not-found error", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 404"),
    );

    await expect(
      updateResource(999, { displayName: "X" }),
    ).rejects.toThrow("Request failed: 404");
  });

  it("propagates unauthorized error", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 401"),
    );

    await expect(
      updateResource(1, { displayName: "X" }),
    ).rejects.toThrow("Request failed: 401");
  });
});

describe("createResourceRelation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const createdRelation = {
    id: 501,
    fromResourceId: 1,
    toResourceId: 2,
    relationType: "depends_on",
    createdAt: "2026-04-14T12:00:00Z",
  };

  it("sends POST /resources/{id}/relations with correct payload", async () => {
    apiClientMock.mockResolvedValue(createdRelation);

    const input: CreateResourceRelationInput = {
      toResourceId: 2,
      relationType: "depends_on",
    };

    const result = await createResourceRelation(1, input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/relations", {
      method: "POST",
      body: JSON.stringify(input),
    });
    expect(result.id).toBe(501);
    expect(result.relationType).toBe("depends_on");
  });

  it("propagates duplicate relation conflict", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 409"),
    );

    await expect(
      createResourceRelation(1, {
        toResourceId: 2,
        relationType: "depends_on",
      }),
    ).rejects.toThrow("Request failed: 409");
  });

  it("propagates target-not-found error", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 404"),
    );

    await expect(
      createResourceRelation(1, {
        toResourceId: 999,
        relationType: "depends_on",
      }),
    ).rejects.toThrow("Request failed: 404");
  });
});

describe("deleteResourceRelation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends DELETE /resource-relations/{id}", async () => {
    apiClientMock.mockResolvedValue(undefined);

    await deleteResourceRelation(501);

    expect(apiClientMock).toHaveBeenCalledWith("/resource-relations/501", {
      method: "DELETE",
    });
  });

  it("propagates not-found error for missing relation", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 404"),
    );

    await expect(deleteResourceRelation(999)).rejects.toThrow(
      "Request failed: 404",
    );
  });
});

describe("listResources with archive filters", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards includeArchived param", async () => {
    apiClientMock.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    await listResources({ includeArchived: true });

    expect(apiClientMock).toHaveBeenCalledWith(
      expect.stringContaining("includeArchived=true"),
    );
  });

  it("omits includeArchived when not set", async () => {
    apiClientMock.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    await listResources({ q: "test" });

    const calledPath = apiClientMock.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("includeArchived");
  });

  it("forwards archivedOnly param", async () => {
    apiClientMock.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    await listResources({ archivedOnly: true });

    expect(apiClientMock).toHaveBeenCalledWith(
      expect.stringContaining("archivedOnly=true"),
    );
  });

  it("omits archivedOnly when not set", async () => {
    apiClientMock.mockResolvedValue({
      items: [],
      pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 },
    });

    await listResources({ q: "test" });

    const calledPath = apiClientMock.mock.calls[0][0] as string;
    expect(calledPath).not.toContain("archivedOnly");
  });
});

describe("archiveResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const archivedResource = {
    id: 1,
    resourceType: "database_instance" as const,
    resourceSubtype: "mysql",
    name: "orders-db-primary",
    displayName: "Orders DB Primary",
    environmentId: 101,
    ownerId: 201,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "mysql:prod:orders-primary",
    labels: {},
    createdAt: "2026-04-14T00:00:00Z",
    updatedAt: "2026-04-14T12:00:00Z",
    archivedAt: "2026-04-14T12:00:00Z",
    archivedBy: 999,
    archiveReason: "Retired from production",
  };

  it("sends POST /resources/{id}/archive with reason", async () => {
    apiClientMock.mockResolvedValue(archivedResource);

    const result = await archiveResource(1, "Retired from production");

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/archive", {
      method: "POST",
      body: JSON.stringify({ reason: "Retired from production" }),
    });
    expect(result.archivedAt).toBe("2026-04-14T12:00:00Z");
    expect(result.archiveReason).toBe("Retired from production");
  });

  it("sends POST /resources/{id}/archive without reason", async () => {
    apiClientMock.mockResolvedValue({ ...archivedResource, archiveReason: null });

    await archiveResource(1);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/archive", {
      method: "POST",
      body: JSON.stringify({}),
    });
  });

  it("propagates 404 for unknown resource", async () => {
    apiClientMock.mockRejectedValue(new Error("Request failed: 404"));

    await expect(archiveResource(999)).rejects.toThrow(
      "Request failed: 404",
    );
  });

  it("propagates 409 for archived resource conflict", async () => {
    apiClientMock.mockRejectedValue(new Error("Request failed: 409"));

    await expect(archiveResource(1)).rejects.toThrow(
      "Request failed: 409",
    );
  });
});

describe("unarchiveResource", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const unarchivedResource = {
    id: 1,
    resourceType: "database_instance" as const,
    resourceSubtype: "mysql",
    name: "orders-db-primary",
    displayName: "Orders DB Primary",
    environmentId: 101,
    ownerId: 201,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    source: "manual",
    externalId: "mysql:prod:orders-primary",
    labels: {},
    createdAt: "2026-04-14T00:00:00Z",
    updatedAt: "2026-04-14T13:00:00Z",
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
  };

  it("sends POST /resources/{id}/unarchive", async () => {
    apiClientMock.mockResolvedValue(unarchivedResource);

    const result = await unarchiveResource(1);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/unarchive", {
      method: "POST",
    });
    expect(result.archivedAt).toBeNull();
  });

  it("propagates 404 for unknown resource", async () => {
    apiClientMock.mockRejectedValue(new Error("Request failed: 404"));

    await expect(unarchiveResource(999)).rejects.toThrow(
      "Request failed: 404",
    );
  });
});
