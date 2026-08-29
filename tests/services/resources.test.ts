// input: Vitest, mocked resources API client, and resource service contracts
// output: resource/profile/relation-rule transport, source-specific relation paths, server-derived completeness write exclusion, managed-identity/effective-value override payloads, and request-shape coverage
// pos: service contract tests for the resources API boundary
// note: if this file changes, update this header and tests/services/README.md.
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  archiveResource,
  clearResourceOverride,
  getEffectiveValues,
  getOverviewMetrics,
  getResourceRelationRules,
  listAllResources,
  listAttentionResources,
  listClusterMembers,
  listDatabaseResources,
  listResources,
  setResourceOverride,
  unarchiveResource,
} from "@/services/resources";
import {
  createResource,
  createResourceRelation,
  deleteProfile,
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
        hasNextPage: true,
        hasPreviousPage: true,
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

  it("starts complete traversals at page 1 even when given a later page", async () => {
    const firstItem = {
      id: 1,
      resourceType: "database_instance" as const,
      resourceSubtype: "mysql",
      name: "orders-db-primary",
      displayName: "Orders DB Primary",
      environmentId: 101,
      ownerId: 201,
      lifecycleStatus: "running" as const,
      healthStatus: "healthy" as const,
      source: "manual" as const,
      externalId: "mysql:prod:orders-primary",
      labels: {},
      createdAt: "2026-04-14T00:00:00Z",
      updatedAt: "2026-04-14T00:00:00Z",
      archivedAt: null,
      archivedBy: null,
      archiveReason: null,
    };
    const secondItem = { ...firstItem, id: 2, name: "orders-db-replica" };

    apiClientMock
      .mockResolvedValueOnce({
        items: [firstItem],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [secondItem],
        pageInfo: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      } satisfies ResourceListResponse);

    await expect(listAllResources({ page: 2, pageSize: 1, environmentId: 101 })).resolves.toEqual([
      firstItem,
      secondItem,
    ]);
    expect(apiClientMock).toHaveBeenNthCalledWith(1, "/resources?pageSize=1&environmentId=101");
    expect(apiClientMock).toHaveBeenNthCalledWith(2, "/resources?page=2&pageSize=1&environmentId=101");
  });

  it("sends resourceType filter for database resources", async () => {
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
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listDatabaseResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("forwards repeated environment and label filters with ownerId", async () => {
    apiClientMock.mockResolvedValue({});

    await listResources({
      environmentId: [7, 8],
      ownerId: 42,
      label: ["team:payments", "tier:1"],
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/resources?environmentId=7&environmentId=8&ownerId=42&label=team%3Apayments&label=tier%3A1",
    );
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
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it("includes healthy cluster with critical members in attention resources", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_cluster",
          resourceSubtype: "clickhouse",
          name: "analytics-ch-cluster-prod",
          displayName: "Analytics ClickHouse Cluster Production",
          environmentId: 1,
          ownerId: 2,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "ch:prod:analytics",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 1,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 0,
            replicaMemberCount: 2,
            worstMemberId: 23,
            worstMemberName: "Analytics ClickHouse Node 02",
            worstMemberStatus: "critical",
          },
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("excludes healthy cluster with no abnormal members from attention resources", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "orders-db-cluster",
          displayName: "Orders DB Cluster",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-cluster",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
          databaseOperationalSummary: {
            memberCount: 2,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 1,
          },
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(0);
  });

  it("excludes healthy cluster without databaseOperationalSummary from attention resources", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "orders-db-cluster",
          displayName: "Orders DB Cluster",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
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
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(0);
  });

  it("includes healthy cluster with stopped members in attention resources", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1,
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "reporting-cluster",
          displayName: "Reporting Cluster",
          environmentId: 1,
          ownerId: 2,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:reporting",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
          databaseOperationalSummary: {
            memberCount: 3,
            criticalMemberCount: 0,
            warningMemberCount: 0,
            stoppedMemberCount: 1,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 2,
          },
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await listAttentionResources();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
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
          healthStatus: "critical",
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
        hasNextPage: false,
        hasPreviousPage: false,
      },
    } satisfies ResourceListResponse);

    const result = await getOverviewMetrics();

    expect(result).toEqual({
      total: 2,
      critical: 1,
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
          hasNextPage: true,
          hasPreviousPage: false,
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
          hasNextPage: false,
          hasPreviousPage: true,
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
          hasNextPage: true,
          hasPreviousPage: false,
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
          hasNextPage: false,
          hasPreviousPage: true,
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
          hasNextPage: true,
          hasPreviousPage: false,
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
          hasNextPage: false,
          hasPreviousPage: true,
        },
      } satisfies ResourceListResponse);

    await expect(listDatabaseResources()).resolves.toHaveLength(2);
    await expect(listAttentionResources()).resolves.toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
    await expect(getOverviewMetrics()).resolves.toEqual({
      total: 2,
      critical: 0,
      warning: 1,
      pending: 1,
    });
  });

  it("keeps the selected environment while finding later-page member signals", async () => {
    apiClientMock
      .mockResolvedValueOnce({
        items: [{
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
        }],
        pageInfo: {
          page: 1,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      } satisfies ResourceListResponse)
      .mockResolvedValueOnce({
        items: [{
          id: 2,
          resourceType: "database_cluster",
          resourceSubtype: "mysql_cluster",
          name: "orders-db-cluster",
          displayName: "Orders DB Cluster",
          environmentId: 101,
          ownerId: 201,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-cluster",
          labels: {},
          databaseOperationalSummary: {
            memberCount: 1,
            criticalMemberCount: 1,
            warningMemberCount: 0,
            stoppedMemberCount: 0,
            degradedMemberCount: 0,
            unknownRoleCount: 0,
            primaryMemberCount: 1,
            replicaMemberCount: 0,
          },
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
          archivedAt: null,
          archivedBy: null,
          archiveReason: null,
        }],
        pageInfo: {
          page: 2,
          pageSize: 1,
          totalItems: 2,
          totalPages: 2,
          hasNextPage: false,
          hasPreviousPage: true,
        },
      } satisfies ResourceListResponse);

    await expect(listAttentionResources({ environmentId: 101 })).resolves.toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
    expect(apiClientMock).toHaveBeenNthCalledWith(1, "/resources?environmentId=101");
    expect(apiClientMock).toHaveBeenNthCalledWith(2, "/resources?page=2&pageSize=1&environmentId=101");
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
	  origin: "manual",
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

  it("never sends server-derived completeness on create", async () => {
    apiClientMock.mockResolvedValue(createdResource);
    const input = {
      origin: "manual" as const,
      resourceType: "service",
      name: "orders-api",
      displayName: "Orders API",
      environmentId: 101,
      ownerId: 201,
      lifecycleStatus: "running",
      healthStatus: "healthy",
      completeness: { score: 100, status: "complete", missingRequirements: [] },
    } as unknown as CreateResourceInput & { completeness: unknown };

    await createResource(input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources", {
      method: "POST",
      body: JSON.stringify({ ...input, completeness: undefined }),
    });
  });

  it("propagates validation error from backend", async () => {
    apiClientMock.mockRejectedValue(
      new Error("Request failed: 400"),
    );

    const input: CreateResourceInput = {
	  origin: "manual",
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
	  origin: "manual",
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

  it("never sends server-derived completeness on update", async () => {
    apiClientMock.mockResolvedValue(updatedResource);
    const input = {
      displayName: "Orders DB Primary (Updated)",
      completeness: { score: 100, status: "complete", missingRequirements: [] },
    } as unknown as UpdateResourceInput & { completeness: unknown };

    await updateResource(1, input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1", {
      method: "PATCH",
      body: JSON.stringify({ displayName: "Orders DB Primary (Updated)" }),
    });
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

  it("uses the supplied source ID in POST /resources/{fromId}/relations", async () => {
    apiClientMock.mockResolvedValue(createdRelation);

    const input: CreateResourceRelationInput = {
      toResourceId: 101,
      relationType: "depends_on",
    };

    const result = await createResourceRelation(9, input);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/9/relations", {
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

describe("getResourceRelationRules", () => {
  it("gets the server-owned rules for the source resource", async () => {
    const response = {
      sourceResourceId: 1,
      sourceEnvironmentId: 101,
      rules: [
        {
          relationType: "member_of",
          targetResourceTypes: ["database_cluster"],
          sameEnvironment: true,
        },
        {
          relationType: "depends_on",
          targetResourceTypes: ["host", "database_instance"],
          sameEnvironment: false,
        },
      ],
    };
    apiClientMock.mockResolvedValue(response);

    await expect(getResourceRelationRules(1)).resolves.toEqual(response);
    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/relation-rules");
  });
});

describe("deleteProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends DELETE /resources/{id}/profile", async () => {
    apiClientMock.mockResolvedValue(undefined);

    await deleteProfile(1);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/profile", {
      method: "DELETE",
    });
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

describe("listClusterMembers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("maps backend resourceId to frontend id", async () => {
    apiClientMock.mockResolvedValue({
      members: [
        {
          resourceId: 22,
          name: "order-mysql-replica-01-prod",
          displayName: "Order MySQL Replica 01 Production",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          profileSummary: {
            hostname: "prod-db-host-02.internal",
            port: 3306,
            engine: "mysql",
            version: "8.0.36",
            role: "replica",
          },
        },
      ],
    });

    const result = await listClusterMembers(1);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/1/members");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(22);
    expect(result[0].name).toBe("order-mysql-replica-01-prod");
    expect(result[0].displayName).toBe("Order MySQL Replica 01 Production");
    expect(result[0].resourceType).toBe("database_instance");
    expect(result[0].resourceSubtype).toBe("mysql");
    expect(result[0].profileSummary?.hostname).toBe("prod-db-host-02.internal");
    expect(result[0].profileSummary?.port).toBe(3306);
    expect(result[0].profileSummary?.engine).toBe("mysql");
    expect(result[0].profileSummary?.version).toBe("8.0.36");
    expect(result[0].profileSummary?.role).toBe("replica");
    expect(result[0].healthStatus).toBe("healthy");
    expect(result[0].lifecycleStatus).toBe("running");
  });

  it("handles members without profileSummary", async () => {
    apiClientMock.mockResolvedValue({
      members: [
        {
          resourceId: 5,
          name: "test-instance",
          displayName: "Test Instance",
          resourceType: "database_instance",
          resourceSubtype: "postgres",
          lifecycleStatus: "provisioning",
          healthStatus: "unknown",
        },
      ],
    });

    const result = await listClusterMembers(10);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(5);
    expect(result[0].profileSummary).toBeUndefined();
  });

  it("returns empty array when cluster has no members", async () => {
    apiClientMock.mockResolvedValue({ members: [] });

    const result = await listClusterMembers(99);

    expect(result).toEqual([]);
  });
});

describe("resource effective values", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends GET, set, and clear requests with the version contract", async () => {
    apiClientMock
      .mockResolvedValueOnce({
        values: {
          displayName: {
            value: "Orders DB Primary",
            provenance: { kind: "observed", source: "cmdb", version: 0 },
          },
        },
      })
      .mockResolvedValueOnce({ version: 6 })
      .mockResolvedValueOnce(undefined);

    await expect(getEffectiveValues(101)).resolves.toEqual({
      values: {
        displayName: {
          value: "Orders DB Primary",
          provenance: { kind: "observed", source: "cmdb", version: 0 },
        },
      },
    });
    await setResourceOverride(101, "displayName", "Operator name", 5);
    await clearResourceOverride(101, "displayName", 6);

    expect(apiClientMock.mock.calls).toEqual([
      ["/resources/101/effective-values"],
      ["/resources/101/overrides/displayName", {
        method: "PUT",
        body: JSON.stringify({ value: "Operator name", expectedVersion: 5 }),
      }],
      ["/resources/101/overrides/displayName", {
        method: "DELETE",
        body: JSON.stringify({ expectedVersion: 6 }),
      }],
    ]);
  });
});
