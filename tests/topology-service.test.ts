import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/services/api-client", () => ({
  apiClient: vi.fn(),
}));

import { apiClient } from "@/services/api-client";
import { getResourceTopology, TopologyNotAvailableError } from "@/services/topology";
import type { TopologyResponse } from "@/types/resource";

const mockApiClient = vi.mocked(apiClient);

const minimalResponse = (overrides: Partial<TopologyResponse> = {}): TopologyResponse => ({
  rootResourceId: 1,
  depth: 1,
  direction: "both",
  nodes: [],
  edges: [],
  groups: [],
  isDatabaseTopology: false,
  ...overrides,
});

describe("getResourceTopology", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /resources/{id}/topology with default params", async () => {
    const mockResponse = minimalResponse({
      nodes: [
        {
          id: 1,
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "test-cluster",
          displayName: "Test Cluster",
          environmentId: 1,
          ownerId: 1,
          lifecycleStatus: "running",
          healthStatus: "healthy",
          isRoot: true,
          distance: 0,
          topologyRole: "cluster",
          topologyLayer: "cluster",
          groupKey: "",
          visualImportance: 0,
          isDatabaseTopology: true,
          replicationDepth: 0,
        },
      ],
      isDatabaseTopology: true,
    });

    mockApiClient.mockResolvedValueOnce(mockResponse);

    const result = await getResourceTopology(1);

    expect(mockApiClient).toHaveBeenCalledTimes(1);
    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/1/topology",
    );
    expect(result).toEqual(mockResponse);
  });

  it("includes depth query parameter", async () => {
    mockApiClient.mockResolvedValueOnce(minimalResponse({ depth: 2 }));

    await getResourceTopology(1, { depth: 2 });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/1/topology?depth=2",
    );
  });

  it("includes direction query parameter", async () => {
    mockApiClient.mockResolvedValueOnce(minimalResponse({ direction: "upstream" }));

    await getResourceTopology(1, { direction: "upstream" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/1/topology?direction=upstream",
    );
  });

  it("includes relationType query parameter", async () => {
    mockApiClient.mockResolvedValueOnce(minimalResponse());

    await getResourceTopology(1, { relationType: "member_of" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/1/topology?relationType=member_of",
    );
  });

  it("combines multiple query parameters", async () => {
    mockApiClient.mockResolvedValueOnce(minimalResponse({
      depth: 2,
      direction: "downstream",
    }));

    await getResourceTopology(1, {
      depth: 2,
      direction: "downstream",
      relationType: "runs_on",
    });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/resources/1/topology?depth=2&direction=downstream&relationType=runs_on",
    );
  });

  it("propagates 404 as error (resource not found)", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("404"));

    await expect(getResourceTopology(1)).rejects.toThrow("404");
  });

  it("propagates non-404/501 errors", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("500"));

    await expect(getResourceTopology(1)).rejects.toThrow("500");
  });

  it("throws TopologyNotAvailableError on 501 (endpoint not implemented)", async () => {
    mockApiClient.mockRejectedValueOnce(new Error("501"));

    await expect(getResourceTopology(1)).rejects.toThrow(TopologyNotAvailableError);
  });

  it("TopologyNotAvailableError has correct name", () => {
    const error = new TopologyNotAvailableError();
    expect(error.name).toBe("TopologyNotAvailableError");
    expect(error.message).toBe("Topology endpoint not available");
  });
});
