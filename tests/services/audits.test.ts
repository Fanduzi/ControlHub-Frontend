// input: vitest, services/audits
// output: audit service tests — pagination/filter forwarding, resource audit path, operator-boundary 403 degradation
// pos: unit tests for audit list/read services
// note: if this file changes, update header and tests/services/README.md
import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAuditEvents, listRecentAuditEvents, listResourceAuditEvents } from "@/services/audits";
import type { AuditEventListResponse } from "@/types/audit";

const { apiClientMock, ApiErrorMock } = vi.hoisted(() => {
  class ApiErrorMock extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { apiClientMock: vi.fn(), ApiErrorMock };
});

vi.mock("@/services/api-client", () => ({
  apiClient: apiClientMock,
  ApiError: ApiErrorMock,
}));

describe("listAuditEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards pagination and filter params and preserves backend page ordering", async () => {
    const response: AuditEventListResponse = {
      items: [
        {
          id: 1001,
          actorUserId: 11,
          targetResourceId: 1,
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-14T00:00:00Z",
        },
        {
          id: 1002,
          actorUserId: 12,
          targetResourceId: 2,
          eventType: "resource.created",
          result: "success",
          createdAt: "2026-04-15T00:00:00Z",
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
    };

    apiClientMock.mockResolvedValue(response);

    const result = await listAuditEvents({
      page: 3,
      pageSize: 5,
      targetResourceId: 1,
      eventType: "resource.updated",
      result: "success",
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/audit-events?page=3&pageSize=5&targetResourceId=1&eventType=resource.updated&result=success",
    );
    expect(result.pageInfo).toEqual(response.pageInfo);
    expect(result.items).toEqual(response.items);
  });

  it("returns the most recent events from paginated items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1001,
          actorUserId: 11,
          targetResourceId: 1,
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-14T00:00:00Z",
        },
        {
          id: 1002,
          actorUserId: 12,
          targetResourceId: 2,
          eventType: "resource.created",
          result: "success",
          createdAt: "2026-04-15T00:00:00Z",
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
    } satisfies AuditEventListResponse);

    const result = await listRecentAuditEvents(1);

    expect(result).toEqual([
      {
        id: 1002,
        actorUserId: 12,
        targetResourceId: 2,
        eventType: "resource.created",
        result: "success",
        createdAt: "2026-04-15T00:00:00Z",
      },
    ]);
  });

  it("collects recent events across backend pages", async () => {
    apiClientMock
      .mockResolvedValueOnce({
        items: [
          {
            id: 1003,
            actorUserId: 11,
            targetResourceId: 1,
            eventType: "resource.updated",
            result: "success",
            createdAt: "2026-04-14T00:00:00Z",
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
      } satisfies AuditEventListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: 1004,
            actorUserId: 12,
            targetResourceId: 2,
            eventType: "resource.created",
            result: "success",
            createdAt: "2026-04-15T00:00:00Z",
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
      } satisfies AuditEventListResponse);

    const result = await listRecentAuditEvents(1);

    expect(result).toEqual([
      {
        id: 1004,
        actorUserId: 12,
        targetResourceId: 2,
        eventType: "resource.created",
        result: "success",
        createdAt: "2026-04-15T00:00:00Z",
      },
    ]);
  });

  it("degrades to an empty audit list when the operator access boundary rejects the read (403)", async () => {
    apiClientMock.mockRejectedValue(
      new ApiErrorMock(403, "admin role is required"),
    );

    const result = await listResourceAuditEvents(7);

    expect(result).toEqual([]);
    expect(apiClientMock).toHaveBeenCalledWith("/resources/7/audit-events");
  });

  it("rethrows non-403 audit read failures", async () => {
    apiClientMock.mockRejectedValue(new ApiErrorMock(500, "internal"));

    await expect(listResourceAuditEvents(7)).rejects.toMatchObject({
      status: 500,
    });
  });

  it("builds resource audit paths with numeric resource ids", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: 1005,
          actorUserId: 13,
          targetResourceId: 7,
          eventType: "resource.archived",
          result: "success",
          createdAt: "2026-04-16T00:00:00Z",
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
    } satisfies AuditEventListResponse);

    const result = await listResourceAuditEvents(7);

    expect(apiClientMock).toHaveBeenCalledWith("/resources/7/audit-events");
    expect(result[0]?.targetResourceId).toBe(7);
  });
});
