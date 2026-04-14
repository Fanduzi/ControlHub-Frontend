import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/api-client", () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from "@/services/api-client";
import { getResourceTopology } from "@/services/topology";
import type { TopologyResponse } from "@/types/resource";

const mockApiClient = vi.mocked(apiClient);

describe("getResourceTopology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /resources/{id}/topology with default params", async () => {
    const mockResponse: TopologyResponse = {
      rootResourceId: "res-1",
      depth: 1,
      direction: "both",
      nodes: [
        {
          id: "res-1",
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "test-cluster",
          displayName: "Test Cluster",
          environmentId: "env-1",
          ownerId: "owner-1",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          isRoot: true,
          distance: 0,
        },
      ],
      edges: [],
    };

    mockApiClient.mockResolvedValueOnce(mockResponse);

    const result = await getResourceTopology("res-1");

    expect(mockApiClient).toHaveBeenCalledTimes(1);
    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/res-1/topology",
    );
    expect(result).toEqual(mockResponse);
  });

  it("includes depth query parameter", async () => {
    mockApiClient.mockResolvedValueOnce({
      rootResourceId: "res-1",
      depth: 2,
      direction: "both",
      nodes: [],
      edges: [],
    });

    await getResourceTopology("res-1", { depth: 2 });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/res-1/topology?depth=2",
    );
  });

  it("includes direction query parameter", async () => {
    mockApiClient.mockResolvedValueOnce({
      rootResourceId: "res-1",
      depth: 1,
      direction: "upstream",
      nodes: [],
      edges: [],
    });

    await getResourceTopology("res-1", { direction: "upstream" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/res-1/topology?direction=upstream",
    );
  });

  it("includes relationType query parameter", async () => {
    mockApiClient.mockResolvedValueOnce({
      rootResourceId: "res-1",
      depth: 1,
      direction: "both",
      nodes: [],
      edges: [],
    });

    await getResourceTopology("res-1", { relationType: "member_of" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/res-1/topology?relationType=member_of",
    );
  });

  it("combines multiple query parameters", async () => {
    mockApiClient.mockResolvedValueOnce({
      rootResourceId: "res-1",
      depth: 2,
      direction: "downstream",
      nodes: [],
      edges: [],
    });

    await getResourceTopology("res-1", {
      depth: 2,
      direction: "downstream",
      relationType: "runs_on",
    });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/res-1/topology?depth=2&direction=downstream&relationType=runs_on",
    );
  });

  it("returns null on 404 response", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("404"));

    const result = await getResourceTopology("nonexistent");

    expect(result).toBeNull();
  });

  it("propagates non-404 errors", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("500"));

    await expect(getResourceTopology("res-1")).rejects.toThrow("500");
  });

  it("returns null on 501 (endpoint not implemented)", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("501"));

    const result = await getResourceTopology("res-1");

    expect(result).toBeNull();
  });
});
