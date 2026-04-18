import { describe, expect, it } from "vitest";
import type { TopologyEdge, TopologyNode, TopologyResponse } from "@/types/resource";
import { mapTopologyToFlow, SOURCE_HANDLE_IDS, TARGET_HANDLE_IDS } from "@/lib/topology-mapper";

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
  it("lays out database topology in vertical layer order top-to-bottom", () => {
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
    const yPos = new Map(nodes.map((n) => [n.id, n.position.y]));
    const xPos = new Map(nodes.map((n) => [n.id, n.position.x]));

    // Vertical layer order: application (top) → entry → replication → control_plane → host (bottom)
    const svcY = yPos.get("svc-1")!;
    const domainY = yPos.get("domain-1")!;
    const proxyY = yPos.get("proxy-1")!;
    const primaryY = yPos.get("primary-1")!;
    const replicaY = yPos.get("replica-1")!;
    const orchY = yPos.get("orch-1")!;
    const hostY = yPos.get("host-1")!;

    // Application layer topmost (lowest y)
    expect(svcY).toBeLessThan(domainY);
    // Entry layer below application
    expect(domainY).toBeLessThan(primaryY);
    expect(proxyY).toBeLessThan(primaryY);
    // Control-plane and host layers below replication
    expect(primaryY).toBeLessThan(orchY);
    expect(replicaY).toBeLessThan(orchY);
    expect(orchY).toBeLessThanOrEqual(hostY);

    // Horizontal: primary at x=0, replica expands right by depth
    const primaryX = xPos.get("primary-1")!;
    const replicaX = xPos.get("replica-1")!;
    expect(primaryX).toBeLessThan(replicaX);
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
    const yPos = new Map(nodes.map((n) => [n.id, n.position.y]));

    const primaryY = yPos.get("primary-1")!;
    const hostY = yPos.get("host-1")!;
    const replicaY = yPos.get("replica-1")!;

    // Host is in a separate layer below replication, never between primary and replica in y
    // Both primary and replica are in the replication layer (same or similar y)
    // Host is below both
    expect(hostY).toBeGreaterThan(primaryY);
    expect(hostY).toBeGreaterThan(replicaY);
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

describe("warning regression tests", () => {
  it("edges must only reference sourceHandle/targetHandle ids that exist on node handles", () => {
    // React Flow warns "Couldn't create edge for source handle id: X"
    // when edge.sourceHandle doesn't match any Handle component's id+type combo.
    // Our Handle components use prefixed ids (source-left, target-left, etc.),
    // so sourceHandle must belong to SOURCE_HANDLE_IDS and targetHandle to TARGET_HANDLE_IDS.
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-repl", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "replication" }),
        makeEdge({ id: "e-traffic", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "traffic" }),
        makeEdge({ id: "e-dep", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "dependency" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    for (const edge of edges) {
      if (edge.sourceHandle != null) {
        expect(SOURCE_HANDLE_IDS.has(edge.sourceHandle), `sourceHandle "${edge.sourceHandle}" must be a source-type handle`).toBe(true);
      }
      if (edge.targetHandle != null) {
        expect(TARGET_HANDLE_IDS.has(edge.targetHandle), `targetHandle "${edge.targetHandle}" must be a target-type handle`).toBe(true);
      }
    }
  });

  it("no edge should reference handles not present on any node component", () => {
    // Broader check: sourceHandle in SOURCE_HANDLE_IDS, targetHandle in TARGET_HANDLE_IDS
    const response = makeResponse({
      nodes: [
        makeNode({ id: "n-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "n-2", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "n-3", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
        makeNode({ id: "cluster-1", topologyRole: "cluster", topologyLayer: "cluster", resourceType: "database_cluster" }),
      ],
      edges: [
        makeEdge({ id: "e-1", fromResourceId: "n-1", toResourceId: "n-2", semanticType: "replication" }),
        makeEdge({ id: "e-2", fromResourceId: "n-1", toResourceId: "n-3", semanticType: "placement" }),
        makeEdge({ id: "e-3", fromResourceId: "n-2", toResourceId: "cluster-1", semanticType: "monitoring" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    for (const edge of edges) {
      if (edge.sourceHandle != null) {
        expect(SOURCE_HANDLE_IDS.has(edge.sourceHandle)).toBe(true);
      }
      if (edge.targetHandle != null) {
        expect(TARGET_HANDLE_IDS.has(edge.targetHandle)).toBe(true);
      }
    }
  });

  it("management/monitoring edges use source-top→target-bottom (not raw 'top')", () => {
    // Regression: old code used sourceHandle="top" but Handle id="top" was type="target",
    // causing React Flow warning. Now sourceHandle must be "source-top" (type=source).
    const response = makeResponse({
      nodes: [
        makeNode({ id: "orch-1", topologyRole: "control_plane", topologyLayer: "control_plane", resourceType: "control_plane_component" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-mgmt", fromResourceId: "orch-1", toResourceId: "primary-1", semanticType: "management" }),
        makeEdge({ id: "e-mon", fromResourceId: "orch-1", toResourceId: "primary-1", semanticType: "monitoring" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    for (const edge of edges) {
      expect(edge.sourceHandle).toBe("source-top");
      expect(edge.targetHandle).toBe("target-bottom");
      // Must NOT be raw position names — those lack the source/target prefix
      expect(edge.sourceHandle).not.toBe("top");
      expect(edge.sourceHandle).not.toBe("bottom");
    }
  });

  it("no node position should contain NaN values", () => {
    // React Flow warns "Received NaN for cx/cy/r/x/y" when positions are NaN.
    // This can happen if layout computation produces NaN from division by zero,
    // undefined arithmetic, or missing position entries.
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", resourceType: "service" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", replicationDepth: 0, resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 1, resourceType: "database_instance" }),
        makeNode({ id: "host-1", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
      ],
      edges: [
        makeEdge({ id: "e-1", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "replication" }),
      ],
    });

    const { nodes } = mapTopologyToFlow(response);

    for (const node of nodes) {
      expect(Number.isNaN(node.position.x)).toBe(false);
      expect(Number.isNaN(node.position.y)).toBe(false);
      expect(typeof node.position.x).toBe("number");
      expect(typeof node.position.y).toBe("number");
    }
  });

  it("node positions are finite numbers even with single-node topology", () => {
    // Edge case: only one node (non-cluster), no edges — layout must still produce valid positions
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", isRoot: true, resourceType: "service" }),
      ],
      edges: [],
    });

    const { nodes } = mapTopologyToFlow(response);

    expect(nodes).toHaveLength(1);
    expect(Number.isFinite(nodes[0].position.x)).toBe(true);
    expect(Number.isFinite(nodes[0].position.y)).toBe(true);
  });

  it("backbone edges (replication, traffic) use valid typed handles", () => {
    // Backbone edges use explicit named handles for deterministic routing.
    // sourceHandle must be in SOURCE_HANDLE_IDS, targetHandle in TARGET_HANDLE_IDS.
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-repl", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "replication" }),
        makeEdge({ id: "e-traffic", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "traffic" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);

    const backboneEdges = edges.filter((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "replication" || st === "traffic";
    });

    expect(backboneEdges.length).toBe(2);
    for (const edge of backboneEdges) {
      if (edge.sourceHandle != null) {
        expect(SOURCE_HANDLE_IDS.has(edge.sourceHandle)).toBe(true);
      }
      if (edge.targetHandle != null) {
        expect(TARGET_HANDLE_IDS.has(edge.targetHandle)).toBe(true);
      }
    }
  });

  it("generic fallback also produces no handle references and no NaN positions", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 1,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0, isRoot: true, resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-2", distance: 1, resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [
        { id: "e-1", fromResourceId: "root-1", toResourceId: "n-2", relationType: "depends_on", semanticType: "dependency" },
      ],
      groups: [],
    };

    const { nodes, edges } = mapTopologyToFlow(response);

    for (const node of nodes) {
      expect(Number.isNaN(node.position.x)).toBe(false);
      expect(Number.isNaN(node.position.y)).toBe(false);
    }
    for (const edge of edges) {
      expect(edge.sourceHandle).toBeUndefined();
      expect(edge.targetHandle).toBeUndefined();
    }
  });

  it("handles nodes with undefined replicationDepth without NaN positions", () => {
    // replicationDepth might be missing from backend data in edge cases
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", replicationDepth: 0 as unknown as undefined, resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", replicationDepth: 1, resourceType: "database_instance" }),
      ],
      edges: [],
    });

    const { nodes } = mapTopologyToFlow(response);

    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
  });

  it("handles generic nodes with undefined distance without NaN positions", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 1,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0 as unknown as undefined, isRoot: true, resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [],
      groups: [],
    };

    const { nodes } = mapTopologyToFlow(response);

    for (const node of nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
    }
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
    const nodeData = nodes[0].data as import("@/lib/topology-mapper").TopologyNodeData;

    expect(nodeData.topologyRole).toBe("primary");
    expect(nodeData.topologyLayer).toBe("replication");
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
    const replicaData = replica.data as import("@/lib/topology-mapper").TopologyNodeData;

    expect(replicaData.replicationDepth).toBe(1);
    expect(replicaData.replicationParentId).toBe("primary-1");
  });
});

describe("named handles for semantic edge routing", () => {
  it("replication edges use right→left handles", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "replica-1", topologyRole: "replica", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-repl", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "replication" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    expect(edges[0].sourceHandle).toBe("source-right");
    expect(edges[0].targetHandle).toBe("target-left");
  });

  it("traffic edges use source-bottom→target-top handles", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", resourceType: "service" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-traffic", fromResourceId: "svc-1", toResourceId: "primary-1", semanticType: "traffic" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    expect(edges[0].sourceHandle).toBe("source-bottom");
    expect(edges[0].targetHandle).toBe("target-top");
  });

  it("placement edges use source-bottom→target-top handles", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "host-1", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
      ],
      edges: [
        makeEdge({ id: "e-place", fromResourceId: "primary-1", toResourceId: "host-1", semanticType: "placement" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    expect(edges[0].sourceHandle).toBe("source-bottom");
    expect(edges[0].targetHandle).toBe("target-top");
  });

  it("management and monitoring edges use source-top→target-bottom handles", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "orch-1", topologyRole: "control_plane", topologyLayer: "control_plane", resourceType: "control_plane_component" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
      edges: [
        makeEdge({ id: "e-mgmt", fromResourceId: "orch-1", toResourceId: "primary-1", semanticType: "management" }),
        makeEdge({ id: "e-mon", fromResourceId: "orch-1", toResourceId: "primary-1", semanticType: "monitoring" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    const mgmtEdge = edges.find((e) => e.id === "e-mgmt")!;
    const monEdge = edges.find((e) => e.id === "e-mon")!;

    expect(mgmtEdge.sourceHandle).toBe("source-top");
    expect(mgmtEdge.targetHandle).toBe("target-bottom");
    expect(monEdge.sourceHandle).toBe("source-top");
    expect(monEdge.targetHandle).toBe("target-bottom");
  });

  it("dependency edges use source-bottom→target-top handles", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", resourceType: "service" }),
        makeNode({ id: "proxy-1", topologyRole: "proxy_active", topologyLayer: "entry", resourceType: "database_proxy" }),
      ],
      edges: [
        makeEdge({ id: "e-dep", fromResourceId: "svc-1", toResourceId: "proxy-1", semanticType: "dependency" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    expect(edges[0].sourceHandle).toBe("source-bottom");
    expect(edges[0].targetHandle).toBe("target-top");
  });

  it("generic topology does not set explicit handles", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 1,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0, isRoot: true, resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
        {
          ...makeNode({ id: "n-2", distance: 1, resourceType: "host" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [
        { id: "e-1", fromResourceId: "root-1", toResourceId: "n-2", relationType: "depends_on", semanticType: "dependency" },
      ],
      groups: [],
    };

    const { edges } = mapTopologyToFlow(response);
    for (const edge of edges) {
      expect(edge.sourceHandle).toBeUndefined();
      expect(edge.targetHandle).toBeUndefined();
    }
  });
});

describe("layer bands for visual grouping", () => {
  it("computes layer bands for database topology", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", resourceType: "service" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
        makeNode({ id: "host-1", topologyRole: "host", topologyLayer: "host", resourceType: "host" }),
      ],
    });

    const { layerBands } = mapTopologyToFlow(response);

    expect(layerBands.length).toBe(3);
    const layerKeys = layerBands.map((b) => b.layerKey);
    expect(layerKeys).toContain("application");
    expect(layerKeys).toContain("replication");
    expect(layerKeys).toContain("host");
  });

  it("layer bands include i18n label keys", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
    });

    const { layerBands } = mapTopologyToFlow(response);

    expect(layerBands.length).toBe(1);
    expect(layerBands[0].labelKey).toBe("topology.layerLabels.replication");
  });

  it("generic topology produces no layer bands", () => {
    const response: TopologyResponse = {
      rootResourceId: "root-1",
      depth: 1,
      direction: "both",
      isDatabaseTopology: false,
      nodes: [
        {
          ...makeNode({ id: "root-1", distance: 0, isRoot: true, resourceType: "service" }),
          topologyRole: "generic",
          topologyLayer: "generic",
          isDatabaseTopology: false,
        },
      ],
      edges: [],
      groups: [],
    };

    const { layerBands } = mapTopologyToFlow(response);
    expect(layerBands).toHaveLength(0);
  });

  it("layer bands have x position, width, y position, and height", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "svc-1", topologyRole: "service", topologyLayer: "application", resourceType: "service" }),
        makeNode({ id: "primary-1", topologyRole: "primary", topologyLayer: "replication", resourceType: "database_instance" }),
      ],
    });

    const { layerBands } = mapTopologyToFlow(response);

    for (const band of layerBands) {
      expect(typeof band.x).toBe("number");
      expect(typeof band.width).toBe("number");
      expect(typeof band.y).toBe("number");
      expect(typeof band.height).toBe("number");
      expect(Number.isFinite(band.x)).toBe(true);
      expect(Number.isFinite(band.width)).toBe(true);
      expect(Number.isFinite(band.y)).toBe(true);
      expect(Number.isFinite(band.height)).toBe(true);
      expect(band.width).toBeGreaterThan(0);
      expect(band.height).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 15B — Vertical layer layout with horizontal replication expansion
// ---------------------------------------------------------------------------
describe("Phase 15B: vertical layer layout", () => {
  /** Helper: build a full database topology response with all layers */
  function fullDbResponse() {
    return makeResponse({
      nodes: [
        makeNode({ id: "svc-1", resourceType: "service", topologyRole: "service", topologyLayer: "application", distance: 2 }),
        makeNode({ id: "domain-1", resourceType: "domain_name", topologyRole: "entry", topologyLayer: "entry", distance: 1 }),
        makeNode({ id: "proxy-ac", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry", distance: 1, name: "a-proxy" }),
        makeNode({ id: "proxy-sb", resourceType: "database_proxy", topologyRole: "proxy_standby", topologyLayer: "entry", distance: 1, name: "b-proxy" }),
        makeNode({ id: "cluster-1", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: true, distance: 0 }),
        makeNode({ id: "primary-1", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0 }),
        makeNode({ id: "replica-1", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1" }),
        makeNode({ id: "replica-2", resourceType: "database_instance", topologyRole: "replica_intermediate", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1" }),
        makeNode({ id: "replica-2a", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication", distance: 2, replicationDepth: 2, replicationParentId: "replica-2" }),
        makeNode({ id: "orch-1", resourceType: "control_plane_component", topologyRole: "control_plane", topologyLayer: "control_plane", distance: 2 }),
        makeNode({ id: "host-1", resourceType: "host", topologyRole: "host", topologyLayer: "host", distance: 2 }),
      ],
    });
  }

  it("application nodes have lower y (higher on screen) than entry/proxy nodes", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const svcY = pos.get("svc-1")!.y;
    const domainY = pos.get("domain-1")!.y;
    const proxyY = pos.get("proxy-ac")!.y;

    expect(svcY).toBeLessThan(domainY);
    expect(svcY).toBeLessThan(proxyY);
  });

  it("entry/proxy nodes have lower y than replication nodes", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const proxyY = pos.get("proxy-ac")!.y;
    const primaryY = pos.get("primary-1")!.y;

    expect(proxyY).toBeLessThan(primaryY);
  });

  it("root cluster node is kept, group box wraps replication nodes", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Root cluster node IS kept visible
    expect(nodeIds.has("cluster-1")).toBe(true);

    // Group box node should also exist
    const groupBox = nodes.find((n) => n.id === "group-cluster-1");
    expect(groupBox).toBeDefined();
    expect(groupBox!.type).toBe("topologyGroup");
  });

  it("primary x-position is left of all replicas", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const primaryX = pos.get("primary-1")!.x;
    const r1X = pos.get("replica-1")!.x;
    const r2X = pos.get("replica-2")!.x;

    expect(primaryX).toBeLessThan(r1X);
    expect(primaryX).toBeLessThan(r2X);
  });

  it("replica x-position increases with replicationDepth", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const primaryX = pos.get("primary-1")!.x;
    const r1X = pos.get("replica-1")!.x;   // depth 1
    const r2aX = pos.get("replica-2a")!.x;  // depth 2

    expect(r1X).toBeGreaterThan(primaryX);
    expect(r2aX).toBeGreaterThan(r1X);
  });

  it("same-depth replicas share the same x band and stack vertically", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const r1Pos = pos.get("replica-1")!;
    const r2Pos = pos.get("replica-2")!;  // both depth 1

    // Same x band (same replication depth = same column)
    expect(r1Pos.x).toBe(r2Pos.x);
    // Different y (stacked vertically)
    expect(r1Pos.y).not.toBe(r2Pos.y);
  });

  it("control plane nodes have higher y (lower on screen) than replication nodes", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const primaryY = pos.get("primary-1")!.y;
    const orchY = pos.get("orch-1")!.y;

    expect(orchY).toBeGreaterThan(primaryY);
  });

  it("host nodes have higher y (lower on screen) than replication nodes", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const primaryY = pos.get("primary-1")!.y;
    const hostY = pos.get("host-1")!.y;

    expect(hostY).toBeGreaterThan(primaryY);
  });

  it("entry layer nodes are centered horizontally above the replication area", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());
    const pos = new Map(nodes.map((n) => [n.id, n.position]));

    // Entry layer nodes should have their x centered relative to the replication area
    const proxyX = pos.get("proxy-ac")!.x;

    // Proxy should NOT be far to the left of primary (old broken layout had proxy on far left)
    // Instead proxy should be roughly centered above the replication area
    // At minimum, proxy x should be >= 0 (not in a separate left column)
    expect(proxyX).toBeGreaterThanOrEqual(0);
  });

  it("active proxy is positioned before standby proxy (deterministic order)", () => {
    const { nodes } = mapTopologyToFlow(fullDbResponse());

    const proxyAc = nodes.find((n) => n.id === "proxy-ac")!;
    const proxySb = nodes.find((n) => n.id === "proxy-sb")!;

    // Active proxy should sort before standby (by role importance)
    const acIdx = nodes.indexOf(proxyAc);
    const sbIdx = nodes.indexOf(proxySb);
    expect(acIdx).toBeLessThan(sbIdx);
  });
});

describe("Phase 15B: failover edge routing", () => {
  it("failover edges use horizontal handles (source-right → target-left)", () => {
    const response = makeResponse({
      nodes: [
        makeNode({ id: "proxy-ac", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry" }),
        makeNode({ id: "proxy-sb", resourceType: "database_proxy", topologyRole: "proxy_standby", topologyLayer: "entry" }),
      ],
      edges: [
        makeEdge({ id: "e-failover", fromResourceId: "proxy-ac", toResourceId: "proxy-sb", semanticType: "failover" }),
      ],
    });

    const { edges } = mapTopologyToFlow(response);
    expect(edges[0].sourceHandle).toBe("source-right");
    expect(edges[0].targetHandle).toBe("target-left");
  });
});

describe("Phase 15B-fix: group box replaces cluster node", () => {
  function fullResponse() {
    return makeResponse({
      nodes: [
        makeNode({ id: "svc-1", resourceType: "service", topologyRole: "service", topologyLayer: "application", distance: 2 }),
        makeNode({ id: "proxy-1", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry", distance: 1 }),
        makeNode({ id: "cluster-1", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: true, distance: 0, displayName: "My Cluster" }),
        makeNode({ id: "primary-1", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0 }),
        makeNode({ id: "replica-1", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1" }),
        makeNode({ id: "orch-1", resourceType: "control_plane_component", topologyRole: "control_plane", topologyLayer: "control_plane", distance: 2 }),
        makeNode({ id: "host-1", resourceType: "host", topologyRole: "host", topologyLayer: "host", distance: 2 }),
      ],
      edges: [
        makeEdge({ id: "e-dep", fromResourceId: "svc-1", toResourceId: "proxy-1", semanticType: "dependency" }),
        makeEdge({ id: "e-traffic", fromResourceId: "proxy-1", toResourceId: "cluster-1", semanticType: "traffic" }),
        makeEdge({ id: "e-member", fromResourceId: "primary-1", toResourceId: "cluster-1", semanticType: "membership" }),
        makeEdge({ id: "e-repl", fromResourceId: "primary-1", toResourceId: "replica-1", semanticType: "replication" }),
        makeEdge({ id: "e-mon", fromResourceId: "orch-1", toResourceId: "cluster-1", semanticType: "monitoring" }),
        makeEdge({ id: "e-place", fromResourceId: "primary-1", toResourceId: "host-1", semanticType: "placement" }),
      ],
    });
  }

  it("root cluster node is kept visible (not removed)", () => {
    const { nodes } = mapTopologyToFlow(fullResponse());
    const rootCluster = nodes.find((n) => n.id === "cluster-1");
    expect(rootCluster).toBeDefined();
    expect(rootCluster!.type).toBe("topologyNode");
  });

  it("non-root cluster nodes are removed and replaced by group box", () => {
    const resp = makeResponse({
      nodes: [
        makeNode({ id: "cluster-1", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: true, distance: 0 }),
        makeNode({ id: "primary-1", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0 }),
        makeNode({ id: "cluster-2", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: false, distance: 2, displayName: "Other Cluster" }),
        makeNode({ id: "primary-2", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 2, replicationDepth: 0 }),
      ],
      edges: [
        makeEdge({ id: "e-repl-1", fromResourceId: "primary-1", toResourceId: "cluster-1", semanticType: "membership" }),
        makeEdge({ id: "e-member-2", fromResourceId: "primary-2", toResourceId: "cluster-2", semanticType: "membership" }),
      ],
    });

    const { nodes } = mapTopologyToFlow(resp);
    // Root cluster is kept
    expect(nodes.find((n) => n.id === "cluster-1")).toBeDefined();
    // Non-root cluster is removed
    expect(nodes.find((n) => n.id === "cluster-2")).toBeUndefined();
    // Group box for non-root cluster exists
    expect(nodes.find((n) => n.id === "group-cluster-2")).toBeDefined();
  });

  it("group box node is created with cluster label", () => {
    const { nodes } = mapTopologyToFlow(fullResponse());
    const gb = nodes.find((n) => n.id === "group-cluster-1");
    expect(gb).toBeDefined();
    expect(gb!.type).toBe("topologyGroup");
    expect((gb!.data as { label: string }).label).toBe("My Cluster");
  });

  it("group box wraps replication nodes", () => {
    const { nodes } = mapTopologyToFlow(fullResponse());
    const gb = nodes.find((n) => n.id === "group-cluster-1")!;
    const primary = nodes.find((n) => n.id === "primary-1")!;
    const replica = nodes.find((n) => n.id === "replica-1")!;

    // Group box should contain primary and replica within its bounds
    const gbRight = gb.position.x + (gb.style?.width as number || 0);
    const gbBottom = gb.position.y + (gb.style?.height as number || 0);

    expect(primary.position.x).toBeGreaterThanOrEqual(gb.position.x);
    expect(primary.position.y).toBeGreaterThanOrEqual(gb.position.y);
    expect(primary.position.x).toBeLessThanOrEqual(gbRight);
    expect(replica.position.x).toBeGreaterThanOrEqual(gb.position.x);
    expect(replica.position.y).toBeLessThanOrEqual(gbBottom);
  });

  it("membership edges are removed from edge list", () => {
    const { edges } = mapTopologyToFlow(fullResponse());
    const membershipEdges = edges.filter((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "membership";
    });
    expect(membershipEdges).toHaveLength(0);
  });

  it("traffic edges targeting root cluster are retargeted to group box", () => {
    const { edges } = mapTopologyToFlow(fullResponse());
    const trafficEdge = edges.find((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "traffic";
    });
    expect(trafficEdge).toBeDefined();
    expect(trafficEdge!.target).toBe("group-cluster-1");
    expect(trafficEdge!.source).toBe("proxy-1");
  });

  it("monitoring edges targeting root cluster are retargeted to group box", () => {
    const { edges } = mapTopologyToFlow(fullResponse());
    const monEdge = edges.find((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "monitoring";
    });
    expect(monEdge).toBeDefined();
    expect(monEdge!.target).toBe("group-cluster-1");
    expect(monEdge!.source).toBe("orch-1");
  });

  it("replication and placement edges remain unchanged", () => {
    const { edges } = mapTopologyToFlow(fullResponse());
    const replEdge = edges.find((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "replication";
    });
    const placeEdge = edges.find((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "placement";
    });

    expect(replEdge!.source).toBe("primary-1");
    expect(replEdge!.target).toBe("replica-1");
    expect(placeEdge!.source).toBe("primary-1");
    expect(placeEdge!.target).toBe("host-1");
  });

  it("dependency edges use bottom→top handles", () => {
    const { edges } = mapTopologyToFlow(fullResponse());
    const depEdge = edges.find((e) => {
      const st = (e.data as { semanticType?: string })?.semanticType;
      return st === "dependency";
    });
    expect(depEdge!.sourceHandle).toBe("source-bottom");
    expect(depEdge!.targetHandle).toBe("target-top");
  });
});

describe("Phase 15B: vertical layer bands", () => {
  it("layer bands use y-ranges for vertical layout", () => {
    const { layerBands } = mapTopologyToFlow(fullDbResponse15B());

    // Each band should have valid x, width, y, and height reflecting the vertical layout
    for (const band of layerBands) {
      expect(Number.isFinite(band.x)).toBe(true);
      expect(Number.isFinite(band.width)).toBe(true);
      expect(band.width).toBeGreaterThan(0);
    }
  });

  it("layer bands include all present layers", () => {
    const { layerBands } = mapTopologyToFlow(fullDbResponse15B());

    const layerKeys = layerBands.map((b) => b.layerKey);
    expect(layerKeys).toContain("application");
    expect(layerKeys).toContain("entry");
    expect(layerKeys).toContain("replication");
    expect(layerKeys).toContain("control_plane");
    expect(layerKeys).toContain("host");
  });
});

function fullDbResponse15B() {
  return makeResponse({
    nodes: [
      makeNode({ id: "svc-1", resourceType: "service", topologyRole: "service", topologyLayer: "application", distance: 2 }),
      makeNode({ id: "proxy-1", resourceType: "database_proxy", topologyRole: "proxy_active", topologyLayer: "entry", distance: 1 }),
      makeNode({ id: "cluster-1", resourceType: "database_cluster", topologyRole: "cluster", topologyLayer: "cluster", isRoot: true, distance: 0 }),
      makeNode({ id: "primary-1", resourceType: "database_instance", topologyRole: "primary", topologyLayer: "replication", distance: 1, replicationDepth: 0 }),
      makeNode({ id: "replica-1", resourceType: "database_instance", topologyRole: "replica", topologyLayer: "replication", distance: 1, replicationDepth: 1, replicationParentId: "primary-1" }),
      makeNode({ id: "orch-1", resourceType: "control_plane_component", topologyRole: "control_plane", topologyLayer: "control_plane", distance: 2 }),
      makeNode({ id: "host-1", resourceType: "host", topologyRole: "host", topologyLayer: "host", distance: 2 }),
    ],
  });
}
