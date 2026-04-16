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

  it("places database topology nodes into semantic layer columns instead of distance columns", () => {
    const response: TopologyResponse = {
      rootResourceId: "cluster-1",
      depth: 2,
      direction: "both",
      nodes: [
        makeNode({ id: "domain-1", resourceType: "domain_name", distance: 1, name: "domain" }),
        makeNode({ id: "vip-1", resourceType: "virtual_ip", distance: 1, name: "vip" }),
        makeNode({ id: "proxy-1", resourceType: "database_proxy", distance: 1, name: "proxy" }),
        makeNode({ id: "cluster-1", resourceType: "database_cluster", distance: 0, isRoot: true, name: "cluster" }),
        makeNode({ id: "inst-1", resourceType: "database_instance", distance: 1, name: "inst" }),
        makeNode({ id: "host-1", resourceType: "host", distance: 2, name: "host" }),
        makeNode({ id: "control-1", resourceType: "control_plane_component", distance: 2, name: "control" }),
        makeNode({ id: "svc-1", resourceType: "service", distance: 2, name: "svc" }),
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);
    const positions = new Map(nodes.map((node) => [node.id, node.position.x]));

    expect(positions.get("domain-1")).toBe(0);
    expect(positions.get("vip-1")).toBe(0);
    expect(positions.get("proxy-1")).toBe(300);
    expect(positions.get("cluster-1")).toBe(600);
    expect(positions.get("inst-1")).toBe(900);
    expect(positions.get("host-1")).toBe(1200);
    expect(positions.get("control-1")).toBe(1200);
    expect(positions.get("svc-1")).toBe(1500);
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
