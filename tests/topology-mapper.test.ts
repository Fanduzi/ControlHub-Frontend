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
      groups: [],
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
      groups: [],
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
      groups: [],
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
    };

    const result1 = mapTopologyToFlow(response);
    const result2 = mapTopologyToFlow(response);

    expect(result1.nodes).not.toBe(result2.nodes);
    expect(result1.edges).not.toBe(result2.edges);
  });

  it("assigns different positions to nodes at different distances", () => {
    const response: TopologyResponse = {
      rootResourceId: "node-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "node-1", isRoot: true, distance: 0 }),
        makeNode({ id: "node-2", distance: 1, name: "inst-1", resourceType: "database_instance" }),
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    const pos0 = nodes.find((n) => n.id === "node-1")!.position;
    const pos1 = nodes.find((n) => n.id === "node-2")!.position;

    // Distance 0 should be at x=0, distance 1 at x=300
    expect(pos0.x).toBe(0);
    expect(pos1.x).toBe(300);
    // Both at same y since they're the only node in their column
    expect(pos0.y).toBe(pos1.y);
  });

  it("stacks same-distance nodes vertically", () => {
    const response: TopologyResponse = {
      rootResourceId: "root",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "root", isRoot: true, distance: 0, name: "root" }),
        makeNode({ id: "a", distance: 1, name: "a", resourceType: "database_cluster" }),
        makeNode({ id: "b", distance: 1, name: "b", resourceType: "database_instance" }),
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    const posA = nodes.find((n) => n.id === "a")!.position;
    const posB = nodes.find((n) => n.id === "b")!.position;

    // Same column (distance 1)
    expect(posA.x).toBe(posB.x);
    // Different rows
    expect(posA.y).not.toBe(posB.y);
    expect(Math.abs(posB.y - posA.y)).toBe(120);
  });

  it("produces deterministic layout (same input = same output)", () => {
    const response: TopologyResponse = {
      rootResourceId: "root",
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: "root", isRoot: true, distance: 0 }),
        makeNode({ id: "n-2", distance: 1, name: "a", resourceType: "database_cluster" }),
        makeNode({ id: "n-3", distance: 2, name: "b", resourceType: "database_instance" }),
      ],
      edges: [],
      groups: [],
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
        makeNode({ id: "n-3", distance: 1, name: "beta", resourceType: "database_instance" }),
        makeNode({ id: "n-4", distance: 2, name: "gamma", resourceType: "host" }),
        makeNode({ id: "n-5", distance: 2, name: "delta", resourceType: "service" }),
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);
    const positions = nodes.map((n) => `${n.position.x},${n.position.y}`);

    // All positions should be unique
    expect(new Set(positions).size).toBe(positions.length);
  });
});
