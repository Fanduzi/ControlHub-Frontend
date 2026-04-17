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
    topologyRole: "cluster",
    topologyLayer: "cluster",
    groupKey: "",
    visualImportance: 0,
    isDatabaseTopology: true,
    replicationDepth: 0,
    replicationParentId: "",
    ...overrides,
  };
}

function makeEdge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id: "edge-1",
    fromResourceId: "node-2",
    toResourceId: "node-1",
    relationType: "member_of",
    semanticType: "membership",
    ...overrides,
  };
}

const DB_TOPOLOGY: Pick<TopologyResponse, "isDatabaseTopology"> = {
  isDatabaseTopology: true,
};

describe("mapTopologyToFlow", () => {
  it("maps nodes with stable ids", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-1", isRoot: true, distance: 0 }),
        makeNode({ id: "node-2", name: "instance-1", displayName: "Instance 1", distance: 1, topologyRole: "primary", topologyLayer: "replication" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
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
      groups: [],
      ...DB_TOPOLOGY,
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
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("edge-1");
    expect(edges[0].source).toBe("node-2");
    expect(edges[0].target).toBe("node-1");
    expect(edges[0].label).toBe("member_of");
  });

  it("orders nodes deterministically", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-3", name: "b-cluster", resourceType: "database_cluster", distance: 1 }),
        makeNode({ id: "node-1", name: "a-cluster", resourceType: "database_cluster", distance: 0, isRoot: true }),
        makeNode({ id: "node-2", name: "a-instance", resourceType: "database_instance", distance: 1, topologyRole: "primary", topologyLayer: "replication" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes[0].id).toBe("node-1");
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
      groups: [],
      ...DB_TOPOLOGY,
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
      groups: [],
      ...DB_TOPOLOGY,
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
      groups: [],
      ...DB_TOPOLOGY,
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
      groups: [],
      ...DB_TOPOLOGY,
    };

    const result1 = mapTopologyToFlow(response);
    const result2 = mapTopologyToFlow(response);

    expect(result1.nodes).not.toBe(result2.nodes);
    expect(result1.edges).not.toBe(result2.edges);
  });

  it("produces deterministic layout (same input = same output)", () => {
    const response: TopologyResponse = {
      rootResourceId: "root",
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: "root", isRoot: true, distance: 0 }),
        makeNode({ id: "n-2", distance: 1, name: "a", resourceType: "database_cluster" }),
        makeNode({ id: "n-3", distance: 2, name: "b", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const r1 = mapTopologyToFlow(response);
    const r2 = mapTopologyToFlow(response);

    for (let i = 0; i < r1.nodes.length; i++) {
      expect(r1.nodes[i].position).toEqual(r2.nodes[i].position);
    }
  });

  it("does not produce overlapping positions for any two nodes", () => {
    const response: TopologyResponse = {
      rootResourceId: "root",
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: "root", isRoot: true, distance: 0 }),
        makeNode({ id: "n-2", distance: 1, name: "alpha", resourceType: "database_cluster" }),
        makeNode({ id: "n-3", distance: 1, name: "beta", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication" }),
        makeNode({ id: "n-4", distance: 2, name: "gamma", resourceType: "host", topologyRole: "host", topologyLayer: "host" }),
        makeNode({ id: "n-5", distance: 2, name: "delta", resourceType: "service", topologyRole: "service", topologyLayer: "application" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { nodes } = mapTopologyToFlow(response);
    const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);

    expect(new Set(positions).size).toBe(positions.length);
  });
});
