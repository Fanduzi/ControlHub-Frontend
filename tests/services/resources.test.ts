import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getOverviewMetrics,
  listAttentionResources,
  listDatabaseResources,
  listResources,
} from "@/services/resources";
import type { ResourceListResponse } from "@/types/resource";

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
          id: "res-1",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: "env-prod",
          ownerId: "owner-dba",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
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
      environmentId: "env-prod",
      lifecycleStatus: "running",
      healthStatus: "healthy",
      q: "orders",
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/resources?page=2&pageSize=10&resourceType=database_instance&environmentId=env-prod&lifecycleStatus=running&healthStatus=healthy&q=orders",
    );
    expect(result.pageInfo).toEqual(response.pageInfo);
    expect(result.items).toHaveLength(1);
  });

  it("filters database resources from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: "res-1",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: "env-prod",
          ownerId: "owner-dba",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
        },
        {
          id: "res-2",
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: "env-prod",
          ownerId: "owner-app",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
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
    expect(result[0].id).toBe("res-1");
  });

  it("filters attention resources from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: "res-1",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: "env-prod",
          ownerId: "owner-dba",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
        },
        {
          id: "res-2",
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: "env-prod",
          ownerId: "owner-app",
          lifecycleStatus: "stopped",
          healthStatus: "warning",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
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
    expect(result[0].id).toBe("res-2");
  });

  it("derives overview metrics from paginated response items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: "res-1",
          resourceType: "database_instance",
          resourceSubtype: "mysql",
          name: "orders-db-primary",
          displayName: "Orders DB Primary",
          environmentId: "env-prod",
          ownerId: "owner-dba",
          lifecycleStatus: "running",
          healthStatus: "degraded",
          source: "manual",
          externalId: "mysql:prod:orders-primary",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
        },
        {
          id: "res-2",
          resourceType: "service",
          resourceSubtype: "api",
          name: "orders-api",
          displayName: "Orders API",
          environmentId: "env-prod",
          ownerId: "owner-app",
          lifecycleStatus: "stopped",
          healthStatus: "warning",
          source: "manual",
          externalId: "svc:orders-api",
          labels: {},
          createdAt: "2026-04-14T00:00:00Z",
          updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-1",
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-2",
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-1",
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-2",
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-1",
            resourceType: "database_instance",
            resourceSubtype: "mysql",
            name: "orders-db-primary",
            displayName: "Orders DB Primary",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "running",
            healthStatus: "healthy",
            source: "manual",
            externalId: "mysql:prod:orders-primary",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
            id: "res-2",
            resourceType: "database_cluster",
            resourceSubtype: "mysql_cluster",
            name: "orders-db-cluster",
            displayName: "Orders DB Cluster",
            environmentId: "env-prod",
            ownerId: "owner-dba",
            lifecycleStatus: "stopped",
            healthStatus: "warning",
            source: "manual",
            externalId: "mysql:prod:orders-cluster",
            labels: {},
            createdAt: "2026-04-14T00:00:00Z",
            updatedAt: "2026-04-14T00:00:00Z",
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
      expect.objectContaining({ id: "res-2" }),
    ]);
    await expect(getOverviewMetrics()).resolves.toEqual({
      total: 2,
      degraded: 0,
      warning: 1,
      pending: 1,
    });
  });
});
