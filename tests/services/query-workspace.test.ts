// input: vitest, @/services/api-client, @/services/query-workspace
// output: query workspace transport contract tests
// pos: service-level regression tests for owner workspace persistence
// note: if this file changes, update this header and tests/services/README.md.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return { ...actual, apiClient: vi.fn() };
});

import { apiClient } from "@/services/api-client";
import { getQueryWorkspace, putQueryWorkspace } from "@/services/query-workspace";

const mockApiClient = vi.mocked(apiClient);

describe("query workspace service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs the owner workspace", async () => {
    mockApiClient.mockResolvedValueOnce({ worksheets: [], version: 0, updatedAt: "2026-08-30T00:00:00Z" });

    await expect(getQueryWorkspace()).resolves.toMatchObject({ version: 0, worksheets: [] });
    expect(mockApiClient).toHaveBeenCalledWith("/query-workspace");
  });

  it("PUTs only the aggregate version and persistent worksheet fields", async () => {
    mockApiClient.mockResolvedValueOnce({ worksheets: [], version: 1, updatedAt: "2026-08-30T00:00:00Z" });

    await putQueryWorkspace(0, [{
      id: "worksheet-1",
      name: "Orders",
      targetResourceId: 22,
      statement: "select * from orders",
      activeDatabase: "orders",
    }]);

    const [path, init] = mockApiClient.mock.calls[0]!;
    expect(path).toBe("/query-workspace");
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      expectedVersion: 0,
      worksheets: [{
        id: "worksheet-1",
        name: "Orders",
        targetResourceId: 22,
        statement: "select * from orders",
        activeDatabase: "orders",
      }],
    });
  });
});
