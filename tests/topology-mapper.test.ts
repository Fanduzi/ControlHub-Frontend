import { describe, expect, it } from "vitest";
import type { TopologyEdge, TopologyNode, TopologyResponse } from "@/types/resource";
import { mapTopologyToFlow } from "@/lib/topology-mapper";

function makeNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: "node-1",
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    name: "test-cluster",
    displayName: "Test Cluster",
    environmentId: "env-1",
    ownerId: "owner-1",
    lifecycleStatus: "running",
    healthStatus: "healthy",
    isRoot: false,
    distance: 1,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id: "edge-1",
    fromResourceId: "node-2",
    toResourceId: "node-1",
    relationType: "member_of",
    ...overrides,
  };
}

describe("mapTopologyToFlow", () => {
  it("maps nodes with stable ids", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-1", isRoot: true, distance: 0 }),
        makeNode({ id: "node-2", name: "instance-1", displayName: "Instance 1", distance: 1 }),
      ],
      edges: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe("node-1");
    expect(nodes[1].id).toBe("node-2");
  });

  it("marks root node visually with isRoot data", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: "node-1", isRoot: true, distance: 0 })],
      edges: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes[0].data.isRoot).toBe(true);
  });

  it("maps edges with source and target from relation fields", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-1" }),
        makeNode({ id: "node-2" }),
      ],
      edges: [
        makeEdge({ id: "edge-1", fromResourceId: "node-2", toResourceId: "node-1", relationType: "member_of" }),
      ],
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("edge-1");
    expect(edges[0].source).toBe("node-2");
    expect(edges[0].target).toBe("node-1");
    expect(edges[0].label).toBe("member_of");
  });

  it("orders nodes by distance, type, name, id deterministically", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-3", name: "b-cluster", resourceType: "database_cluster", distance: 1 }),
        makeNode({ id: "node-1", name: "a-cluster", resourceType: "database_cluster", distance: 0, isRoot: true }),
        makeNode({ id: "node-2", name: "a-instance", resourceType: "database_instance", distance: 1 }),
      ],
      edges: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    // distance 0 first, then distance 1 sorted by type then name then id
    expect(nodes[0].id).toBe("node-1");
    // database_cluster < database_instance lexicographically
    expect(nodes[1].id).toBe("node-3"); // b-cluster (database_cluster)
    expect(nodes[2].id).toBe("node-2"); // a-instance (database_instance)
  });

  it("orders edges by relationType, source, target, id", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-1" }),
        makeNode({ id: "node-2" }),
        makeNode({ id: "node-3" }),
      ],
      edges: [
        makeEdge({ id: "edge-2", fromResourceId: "node-3", toResourceId: "node-1", relationType: "runs_on" }),
        makeEdge({ id: "edge-1", fromResourceId: "node-2", toResourceId: "node-1", relationType: "member_of" }),
      ],
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges[0].id).toBe("edge-1"); // member_of < runs_on
    expect(edges[1].id).toBe("edge-2");
  });

  it("includes node metadata in data field", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({
          id: "node-1",
          resourceType: "database_cluster",
          resourceSubtype: "mysql",
          name: "test-cluster",
          displayName: "Test Cluster",
          lifecycleStatus: "running",
          healthStatus: "healthy",
          isRoot: true,
          distance: 0,
        }),
      ],
      edges: [],
    };

    const { nodes } = mapTopologyToFlow(response);
    const data = nodes[0].data;

    expect(data.resourceType).toBe("database_cluster");
    expect(data.resourceSubtype).toBe("mysql");
    expect(data.name).toBe("test-cluster");
    expect(data.displayName).toBe("Test Cluster");
    expect(data.lifecycleStatus).toBe("running");
    expect(data.healthStatus).toBe("healthy");
    expect(data.isRoot).toBe(true);
    expect(data.distance).toBe(0);
  });

  it("handles empty topology (root only, no edges)", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: "node-1", isRoot: true, distance: 0 })],
      edges: [],
    };

    const { nodes, edges } = mapTopologyToFlow(response);

    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
  });

  it("produces memoization-safe references (new arrays each call)", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: "node-1", isRoot: true, distance: 0 })],
      edges: [],
    };

    const result1 = mapTopologyToFlow(response);
    const result2 = mapTopologyToFlow(response);

    expect(result1.nodes).not.toBe(result2.nodes);
    expect(result1.edges).not.toBe(result2.edges);
  });
});
