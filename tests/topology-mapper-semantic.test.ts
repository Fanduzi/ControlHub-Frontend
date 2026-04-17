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

function makeResponse(overrides: Partial<TopologyResponse> = {}): TopologyResponse {
  return {
    rootResourceId: "cluster-1",
    depth: 2,
    direction: "both",
    nodes: [],
    edges: [],
    groups: [],
    isDatabaseTopology: true,
    ...overrides,
  };
}

describe("database semantic topology layout", () => {
  it("lays out database topology in semantic layer order left-to-right", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", resourceType: "service", topologyRole: "service", topologyLayer: "application", distance: 2 }),
        makeNode({ id: "domain-1", resourceType: "domain_name", topologyRole: "entry", topologyLayer: "entry", distance: 1 }),
        makeNode({ id: "vip-1", resourceType: "virtual_ip", topologyRole: "entry", topologyLayer: "entry", distance: 1 }),
        makeNode({ id: "proxy-1", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry", distance: 1 }),
        makeNode({ id: "cluster-1", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: true, distance: 0 }),
        makeNode({ id: "primary-1", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0 }),
        makeNode({ id: "replica-1", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1" }),
        makeNode({ id: "orch-1", resourceType: "control_plane_component", topologyRole: "control_plane", topologyLayer: "control_plane", distance: 2 }),
        makeNode({ id: "host-1", resourceType: "host", topologyRole: "host", topologyLayer: "host", distance: 2 }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);
    const positions = new Map(nodes.map((n) => [n.id, n.position.x]));

    // Layer order: application -> entry -> cluster -> replication -> control_plane -> host
    const svcX = positions.get("svc-1")!;
    const domainX = positions.get("domain-1")!;
    const proxyX = positions.get("proxy-1")!;
    const clusterX = positions.get("cluster-1")!;
    const primaryX = positions.get("primary-1")!;
    const replicaX = positions.get("replica-1")!;
    const orchX = positions.get("orch-1")!;
    const hostX = positions.get("host-1")!;

    // Application layer leftmost
    expect(svcX).toBeLessThan(domainX);
    // Entry layer after application
    expect(domainX).toBeLessThan(clusterX);
    expect(proxyX).toBeLessThan(clusterX);
    // Cluster layer after entry
    expect(clusterX).toBeLessThan(primaryX);
    // Replication layer: primary at depth 0, replica at depth 1 (further right)
    expect(primaryX).toBeLessThan(replicaX);
    // Control-plane and host layers are to the right of the replication chain
    expect(replicaX).toBeLessThanOrEqual(orchX);
    expect(replicaX).toBeLessThanOrEqual(hostX);
  });

  it("places primary at the leftmost replication position, replicas expand rightward by replicationDepth", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0, resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1", resourceType: "database_instance" }),
        makeNode({ id: "replica-2", topologyRole: "replica_intermediate", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1", resourceType: "database_instance" }),
        makeNode({ id: "replica-2a", topologyRole: "replica", topologyLayer: "replication", distance: 2, replicationDepth: 2, replicationParentId: "replica-2", resourceType: "database_instance" }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);
    const positions = new Map(nodes.map((n) => [n.id, n.position.x]));

    const primaryX = positions.get("primary-1")!;
    const r1X = positions.get("replica-1")!;
    const r2X = positions.get("replica-2")!;
    const r2aX = positions.get("replica-2a")!;

    // Primary is leftmost in the replication band
    expect(primaryX).toBeLessThan(r1X);
    expect(primaryX).toBeLessThan(r2X);

    // Depth-1 replicas are to the right of primary
    expect(r1X).toBeGreaterThan(primaryX);
    expect(r2X).toBeGreaterThan(primaryX);

    // Depth-2 replica is to the right of its depth-1 parent
    expect(r2aX).toBeGreaterThan(r2X);
  });

  it("sorts active proxy before standby proxy within the same layer", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "proxy-sb", resourceType: "database_proxy", topologyRole: "proxy_standby", topologyLayer: "entry", name: "a-proxy", distance: 1 }),
        makeNode({ id: "proxy-ac", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry", name: "b-proxy", distance: 1 }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);

    // Active proxy sorts before standby proxy
    expect(nodes[0].id).toBe("proxy-ac");
    expect(nodes[1].id).toBe("proxy-sb");
  });

  it("sorts replica_intermediate before leaf replica at same depth", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "leaf-replica", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 1, resourceType: "database_instance", name: "a-leaf" }),
        makeNode({ id: "inter-replica", topologyRole: "replica_intermediate", topologyLayer: "replication", replicationDepth: 1, resourceType: "database_instance", name: "b-inter" }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);

    // Intermediate (has children) sorts before leaf replica
    expect(nodes[0].id).toBe("inter-replica");
    expect(nodes[1].id).toBe("leaf-replica");
  });

  it("does not place host nodes in the middle of the replication chain", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", replicationDepth: 0, resourceType: "database_instance" }),
        makeNode({ id: "host-1", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 1, resourceType: "database_instance" }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);
    const positions = new Map(nodes.map((n) => [n.id, n.position.x]));

    const primaryX = positions.get("primary-1")!;
    const hostX = positions.get("host-1")!;
    const replicaX = positions.get("replica-1")!;

    // Host should not be between primary and replica in x axis
    const hostOutsideReplication = hostX >= Math.max(primaryX, replicaX) || hostX <= Math.min(primaryX, replicaX);
    expect(hostOutsideReplication).toBe(true);
  });

  it("produces deterministic layout (same input = same output)", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", replicationDepth: 0, resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 1, replicationParentId: "primary-1", resourceType: "database_instance" }),
        makeNode({ id: "replica-2", topologyRole: "replica_intermediate", topologyLayer: "replication", replicationDepth: 1, replicationParentId: "primary-1", resourceType: "database_instance" }),
        makeNode({ id: "replica-2a", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 2, replicationParentId: "replica-2", resourceType: "database_instance" }),
      ],
    });

    const r1 = mapTopologyToFlow(response);
    const r2 = mapTopologyToFlow(response);

    for (let i = 0; i < r1.nodes.length; i++) {
      expect(r1.nodes[i].id).toBe(r2.nodes[i].id);
      expect(r1.nodes[i].position).toEqual(r2.nodes[i].position);
    }
  });
});

describe("semantic edge types", () => {
  it("preserves semantic edge type in edge data", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-1", fromResourceId: "primary-1", toResourceId: "replica-1", relationType: "replicates_to", semanticType: "replication" }),
        makeEdge({ id: "e-2", fromResourceId: "host-1", toResourceId: "primary-1", relationType: "runs_on", semanticType: "placement" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    expect(edges).toHaveLength(2);
    expect(edges[0].data?.semanticType).toBe("replication");
    expect(edges[1].data?.semanticType).toBe("placement");
  });

  it("weakens non-replication edges (placement, monitoring, management)", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "n-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "n-2", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "n-3", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
      ],
      edges: [
        makeEdge({ id: "e-repl", fromResourceId: "n-1", toResourceId: "n-2", semanticType: "replication" }),
        makeEdge({ id: "e-place", fromResourceId: "n-1", toResourceId: "n-3", semanticType: "placement" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    const replEdge = edges.find((e) => e.id === "e-repl")!;
    const placeEdge = edges.find((e) => e.id === "e-place")!;

    // Replication edges are the backbone
    expect(replEdge.type).toBe("smoothstep");
    // Non-replication edges are weakened (reduced opacity)
    expect(placeEdge.style?.opacity).toBeLessThan(1);
  });
});

describe("generic topology fallback", () => {
  it("uses distance-based ordering for non-database topology", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 2,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0, isRoot: true, name: "root", resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-2", distance: 1, name: "b-node", resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-3", distance: 2, name: "a-node", resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes[0].id).toBe("root-1");
    expect(nodes[1].id).toBe("n-2");
    expect(nodes[2].id).toBe("n-3");
  });

  it("positions generic nodes by distance columns, not semantic layers", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 2,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0, isRoot: true, name: "root", resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-2", distance: 1, name: "first-ring", resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-3", distance: 2, name: "second-ring", resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);
    const positions = new Map(nodes.map((n) => [n.id, n.position.x]));

    expect(positions.get("root-1")!).toBeLessThan(positions.get("n-2")!);
    expect(positions.get("n-2")!).toBeLessThan(positions.get("n-3")!);
  });

  it("generic fallback preserves type-then-name ordering", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 1,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "n-2", distance: 1, name: "beta", resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-3", distance: 1, name: "alpha", resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    // host has lower type order than service in generic mode
    expect(nodes[0].id).toBe("n-3"); // host "alpha"
    expect(nodes[1].id).toBe("n-2"); // service "beta"
  });
});

describe("semantic field propagation", () => {
  it("propagates topologyRole and topologyLayer to node data", () => {
    const response = makeResponse({
      nodes: [
        makeNode({
          id: "primary-1",
          topologyRole: "primary",
          topologyLayer: "replication",
          resourceType: "database_instance",
        }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes[0].data.topologyRole).toBe("primary");
    expect(nodes[0].data.topologyLayer).toBe("replication");
  });

  it("propagates replicationDepth and replicationParentId to node data", () => {
    const response = makeResponse({
      nodes: [
        makeNode({
          id: "primary-1",
          topologyRole: "primary",
          topologyLayer: "replication",
          replicationDepth: 0,
          replicationParentId: "",
          resourceType: "database_instance",
        }),
        makeNode({
          id: "replica-1",
          topologyRole: "replica",
          topologyLayer: "replication",
          replicationDepth: 1,
          replicationParentId: "primary-1",
          resourceType: "database_instance",
        }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);
    const replica = nodes.find((n) => n.id === "replica-1")!;

    expect(replica.data.replicationDepth).toBe(1);
    expect(replica.data.replicationParentId).toBe("primary-1");
  });
});
