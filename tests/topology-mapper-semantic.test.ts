import { describe, expect, it } from "vitest";
import type { TopologyNode, TopologyResponse } from "@/types/resource";
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

describe("topology semantic ordering", () => {
  it("orders database infrastructure types in hierarchy order", () => {
    const response: TopologyResponse = {
      rootResourceId: "cluster-1",
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: "cluster-1", resourceType: "database_cluster", distance: 0, isRoot: true, name: "cluster" }),
        makeNode({ id: "svc-1", resourceType: "service", distance: 1, name: "svc" }),
        makeNode({ id: "proxy-1", resourceType: "database_proxy", distance: 1, name: "proxy" }),
        makeNode({ id: "vip-1", resourceType: "virtual_ip", distance: 1, name: "vip" }),
        makeNode({ id: "inst-1", resourceType: "database_instance", distance: 1, name: "inst" }),
        makeNode({ id: "host-1", resourceType: "host", distance: 1, name: "host" }),
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    // Distance 0 first (root cluster)
    expect(nodes[0].id).toBe("cluster-1");

    // Distance 1 should follow semantic hierarchy:
    // vip (0), proxy (2), inst (4), host (5), svc (7)
    const distance1Nodes = nodes.filter((n) => n.id !== "cluster-1");
    expect(distance1Nodes.map((n) => n.id)).toEqual([
      "vip-1",
      "proxy-1",
      "inst-1",
      "host-1",
      "svc-1",
    ]);
  });

  it("uses smoothstep edge type for cleaner database topology edges", () => {
    const response: TopologyResponse = {
      rootResourceId: "cluster-1",
      depth: 1,
      direction: "both",
      nodes: [
        makeNode({ id: "cluster-1", distance: 0, isRoot: true }),
        makeNode({ id: "inst-1", distance: 1, resourceType: "database_instance" }),
      ],
      edges: [
        { id: "e-1", fromResourceId: "inst-1", toResourceId: "cluster-1", relationType: "member_of" },
      ],
      groups: [],
    };

    const { edges } = mapTopologyToFlow(response);

    expect(edges[0].type).toBe("smoothstep");
  });
});
