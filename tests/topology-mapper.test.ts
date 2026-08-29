// input: topology mapper public interface and transport fixtures
// output: mapper behavior regression coverage
// pos: topology graph mapper contract tests
// note: if this file changes, update this header and module README.md.
import { describe, expect, it } from "vitest";
import type { TopologyEdge, TopologyNode, TopologyResponse } from "@/types/resource";
import { mapTopologyToFlow } from "@/lib/topology-mapper";

function makeNode(overrides: Partial<TopologyNode> = {}): TopologyNode {
  return {
    id: 1,
    resourceType: "database_cluster",
    resourceSubtype: "mysql",
    name: "test-cluster",
    displayName: "Test Cluster",
    environmentId: 1,
    ownerId: 1,
    lifecycleStatus: "running",
    healthStatus: "healthy",
    isRoot: false,
    distance: 1,
    topologyRole: "generic",
    topologyLayer: "generic",
    groupKey: "",
    visualImportance: 0,
    isDatabaseTopology: true,
    replicationDepth: 0,
    replicationParentId: undefined,
    ...overrides,
  };
}

function makeEdge(overrides: Partial<TopologyEdge> = {}): TopologyEdge {
  return {
    id: 1,
    fromResourceId: 2,
    toResourceId: 1,
    relationType: "member_of",
    semanticType: "membership",
    ...overrides,
  };
}

const DB_TOPOLOGY: Pick<TopologyResponse, "isDatabaseTopology"> = {
  isDatabaseTopology: true,
};

describe("mapTopologyToFlow", () => {
  it("uses a non-root cluster name for an instance-root group box", () => {
    const { nodes } = mapTopologyToFlow({
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: 1, resourceType: "database_instance", name: "orders-primary", displayName: "Orders Primary", isRoot: true, distance: 0, topologyRole: "primary", topologyLayer: "replication" }),
        makeNode({ id: 2, resourceType: "database_cluster", name: "orders-cluster", displayName: "Orders Cluster", distance: 1, topologyRole: "cluster", topologyLayer: "cluster" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    });

    expect((nodes.find((node) => node.id === "group-box")!.data as { label: string }).label).toBe("Orders Cluster");
  });

  it("maps nodes with stable ids", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: 1, isRoot: true, distance: 0, topologyRole: "service", topologyLayer: "application" }),
        makeNode({ id: 2, name: "instance-1", displayName: "Instance 1", distance: 1, topologyRole: "primary", topologyLayer: "replication" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].id).toBe("1");
    expect(nodes[1].id).toBe("2");
  });

  it("marks root node visually with isRoot data", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: 1, isRoot: true, distance: 0 })],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { nodes } = mapTopologyToFlow(response);

    expect((nodes[0].data as import("@/lib/topology-mapper").TopologyNodeData).isRoot).toBe(true);
  });

  it("maps edges with source and target from relation fields", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: 1 }),
        makeNode({ id: 2 }),
      ],
      edges: [
        makeEdge({ id: 1, fromResourceId: 2, toResourceId: 1, relationType: "depends_on", semanticType: "dependency" }),
      ],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe("1");
    expect(edges[0].source).toBe("2");
    expect(edges[0].target).toBe("1");
  });

  it("orders nodes deterministically", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: 3, name: "b-host", resourceType: "host", distance: 1, topologyRole: "host", topologyLayer: "host" }),
        makeNode({ id: 1, name: "a-service", resourceType: "service", distance: 0, isRoot: true, topologyRole: "service", topologyLayer: "application" }),
        makeNode({ id: 2, name: "a-instance", resourceType: "database_instance", distance: 1, topologyRole: "primary", topologyLayer: "replication" }),
      ],
      edges: [],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes[0].id).toBe("1");
  });

  it("orders edges by relationType, source, target, id", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: 1 }),
        makeNode({ id: 2 }),
        makeNode({ id: 3 }),
      ],
      edges: [
        makeEdge({ id: 2, fromResourceId: 3, toResourceId: 1, relationType: "runs_on", semanticType: "placement" }),
        makeEdge({ id: 1, fromResourceId: 2, toResourceId: 1, relationType: "depends_on", semanticType: "dependency" }),
      ],
      groups: [],
      ...DB_TOPOLOGY,
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges[0].id).toBe("1"); // depends_on < runs_on
    expect(edges[1].id).toBe("2");
  });

  it("includes node metadata in data field", () => {
    const response: TopologyResponse = {
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({
          id: 1,
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
    const data = nodes[0].data as import("@/lib/topology-mapper").TopologyNodeData;

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
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: 1, isRoot: true, distance: 0 })],
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
      rootResourceId: 1,
      depth: 1,
      direction: "both",
      nodes: [makeNode({ id: 1, isRoot: true, distance: 0 })],
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
      rootResourceId: 10,
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: 10, isRoot: true, distance: 0 }),
        makeNode({ id: 11, distance: 1, name: "a", resourceType: "database_cluster" }),
        makeNode({ id: 12, distance: 2, name: "b", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication" }),
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
      rootResourceId: 10,
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: 10, isRoot: true, distance: 0 }),
        makeNode({ id: 11, distance: 1, name: "alpha", resourceType: "database_cluster" }),
        makeNode({ id: 12, distance: 1, name: "beta", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication" }),
        makeNode({ id: 13, distance: 2, name: "gamma", resourceType: "host", topologyRole: "host", topologyLayer: "host" }),
        makeNode({ id: 14, distance: 2, name: "delta", resourceType: "service", topologyRole: "service", topologyLayer: "application" }),
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
