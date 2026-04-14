import { beforeEach, describe, expect, it, vi } from "vitest";

import { listAuditEvents, listRecentAuditEvents } from "@/services/audits";
import type { AuditEventListResponse } from "@/types/audit";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
}));

vi.mock("@/services/api-client", () => ({
  apiClient: apiClientMock,
}));

describe("listAuditEvents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("forwards pagination and filter params and preserves backend page ordering", async () => {
    const response: AuditEventListResponse = {
      items: [
        {
          id: "audit-older",
          actorUserId: "user-1",
          targetResourceId: "res-1",
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-14T00:00:00Z",
        },
        {
          id: "audit-newer",
          actorUserId: "user-2",
          targetResourceId: "res-2",
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
      },
    };

    apiClientMock.mockResolvedValue(response);

    const result = await listAuditEvents({
      page: 3,
      pageSize: 5,
      targetResourceId: "res-1",
      eventType: "resource.updated",
      result: "success",
    });

    expect(apiClientMock).toHaveBeenCalledWith(
      "/audit-events?page=3&pageSize=5&targetResourceId=res-1&eventType=resource.updated&result=success",
    );
    expect(result.pageInfo).toEqual(response.pageInfo);
    expect(result.items).toEqual(response.items);
  });

  it("returns the most recent events from paginated items", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          id: "audit-older",
          actorUserId: "user-1",
          targetResourceId: "res-1",
          eventType: "resource.updated",
          result: "success",
          createdAt: "2026-04-14T00:00:00Z",
        },
        {
          id: "audit-newer",
          actorUserId: "user-2",
          targetResourceId: "res-2",
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
      },
    } satisfies AuditEventListResponse);

    const result = await listRecentAuditEvents(1);

    expect(result).toEqual([
      {
        id: "audit-newer",
        actorUserId: "user-2",
        targetResourceId: "res-2",
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
            id: "audit-middle",
            actorUserId: "user-1",
            targetResourceId: "res-1",
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
        },
      } satisfies AuditEventListResponse)
      .mockResolvedValueOnce({
        items: [
          {
            id: "audit-newest",
            actorUserId: "user-2",
            targetResourceId: "res-2",
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
        },
      } satisfies AuditEventListResponse);

    const result = await listRecentAuditEvents(1);

    expect(result).toEqual([
      {
        id: "audit-newest",
        actorUserId: "user-2",
        targetResourceId: "res-2",
        eventType: "resource.created",
        result: "success",
        createdAt: "2026-04-15T00:00:00Z",
      },
    ]);
  });
});
