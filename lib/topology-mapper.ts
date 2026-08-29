// input: backend topology transport response and graph layout constants
// output: React Flow nodes, edges, and database group layouts
// pos: shared topology transport-to-graph mapper
// note: if this file changes, update this header and module README.md.
import type { Edge, Node } from "@xyflow/react";
import type { EdgeSemanticType, TopologyEdge, TopologyLayer, TopologyNode, TopologyResponse, TopologyRole } from "@/types/resource";

type TopologyNodeData = TopologyNode & {
  label: string;
  /** Layer band label for visual grouping */
  layerBand: string | null;
};

type GroupBoxData = {
  label: string;
  role?: TopologyRole;
};

const COLUMN_WIDTH = 360;
const ROW_HEIGHT = 140;
/** Vertical gap between layer bands. */
const LAYER_GAP = 80;
/** Padding inside the group box around replication nodes. */
const GROUP_PADDING = 40;
/** Extra top padding in group box for the label. */
const GROUP_LABEL_HEIGHT = 28;

// --- Database semantic layer ordering (top to bottom) ---
const SEMANTIC_LAYER_ORDER: Record<TopologyLayer, number> = {
  application: 0,
  entry: 1,
  cluster: 2,
  replication: 3,
  control_plane: 4,
  host: 5,
  generic: 6,
};

const LAYER_LABEL_KEYS: Record<TopologyLayer, string> = {
  application: "topology.layerLabels.application",
  entry: "topology.layerLabels.entry",
  cluster: "topology.layerLabels.cluster",
  replication: "topology.layerLabels.replication",
  control_plane: "topology.layerLabels.controlPlane",
  host: "topology.layerLabels.host",
  generic: "topology.layerLabels.generic",
};

// Within the replication layer, sort by role importance
const ROLE_IMPORTANCE: Record<TopologyRole, number> = {
  primary: 0,
  replica_intermediate: 1,
  replica: 2,
  proxy_active: 0,
  proxy_standby: 1,
  cluster: 0,
  entry: 0,
  application: 0,
  service: 0,
  host: 0,
  control_plane: 0,
  generic: 0,
};

// --- Generic fallback ordering ---
const TYPE_DISPLAY_ORDER: Record<string, number> = {
  domain_name: 0,
  virtual_ip: 1,
  database_proxy: 2,
  database_cluster: 3,
  database_instance: 4,
  host: 5,
  control_plane_component: 6,
  service: 7,
};

// Edge semantic types that are "structural backbone" — drawn prominently
const BACKBONE_SEMANTIC_TYPES: Set<EdgeSemanticType> = new Set([
  "replication",
  "traffic",
]);

// Handle IDs: each position has both source and target variants
// so edges can connect in either direction from any side.
const HANDLE_SOURCE_LEFT = "source-left";
const HANDLE_TARGET_LEFT = "target-left";
const HANDLE_SOURCE_RIGHT = "source-right";
const HANDLE_TARGET_RIGHT = "target-right";
const HANDLE_SOURCE_TOP = "source-top";
const HANDLE_TARGET_TOP = "target-top";
const HANDLE_SOURCE_BOTTOM = "source-bottom";
const HANDLE_TARGET_BOTTOM = "target-bottom";

/** All valid source handle IDs on topology nodes. */
export const SOURCE_HANDLE_IDS = new Set([
  HANDLE_SOURCE_LEFT,
  HANDLE_SOURCE_RIGHT,
  HANDLE_SOURCE_TOP,
  HANDLE_SOURCE_BOTTOM,
]);

/** All valid target handle IDs on topology nodes. */
export const TARGET_HANDLE_IDS = new Set([
  HANDLE_TARGET_LEFT,
  HANDLE_TARGET_RIGHT,
  HANDLE_TARGET_TOP,
  HANDLE_TARGET_BOTTOM,
]);

function getEdgeHandles(
  semanticType: EdgeSemanticType | undefined,
): { sourceHandle?: string; targetHandle?: string } {
  switch (semanticType) {
    case "replication":
      // Replication flows left-to-right: source right → target left
      return {
        sourceHandle: HANDLE_SOURCE_RIGHT,
        targetHandle: HANDLE_TARGET_LEFT,
      };
    case "traffic":
      // Traffic flows vertically downward: source bottom → target top
      return {
        sourceHandle: HANDLE_SOURCE_BOTTOM,
        targetHandle: HANDLE_TARGET_TOP,
      };
    case "failover":
      // Failover is a proxy/entry layer relationship: horizontal handles
      return {
        sourceHandle: HANDLE_SOURCE_RIGHT,
        targetHandle: HANDLE_TARGET_LEFT,
      };
    case "dependency":
      // Service dependency flows downward: source bottom → target top
      return {
        sourceHandle: HANDLE_SOURCE_BOTTOM,
        targetHandle: HANDLE_TARGET_TOP,
      };
    case "management":
    case "monitoring":
      // Control-plane edges: source top → target bottom (visually upward from control plane)
      return {
        sourceHandle: HANDLE_SOURCE_TOP,
        targetHandle: HANDLE_TARGET_BOTTOM,
      };
    case "placement":
      // Host placement: vertical downward from database to host
      return {
        sourceHandle: HANDLE_SOURCE_BOTTOM,
        targetHandle: HANDLE_TARGET_TOP,
      };
    case "membership":
      // Membership: member → parent (upward from replica to cluster)
      return {
        sourceHandle: HANDLE_SOURCE_TOP,
        targetHandle: HANDLE_TARGET_BOTTOM,
      };
    default:
      // Default: no explicit handles, let React Flow decide
      return {};
  }
}

// --- Database semantic comparison ---
function compareNodesSemantic(a: TopologyNode, b: TopologyNode): number {
  const layerA = SEMANTIC_LAYER_ORDER[a.topologyLayer] ?? 99;
  const layerB = SEMANTIC_LAYER_ORDER[b.topologyLayer] ?? 99;
  if (layerA !== layerB) return layerA - layerB;

  // Within replication layer: sort by replicationDepth
  if (a.topologyLayer === "replication" && b.topologyLayer === "replication") {
    if (a.replicationDepth !== b.replicationDepth) {
      return a.replicationDepth - b.replicationDepth;
    }
    const roleA = ROLE_IMPORTANCE[a.topologyRole] ?? 99;
    const roleB = ROLE_IMPORTANCE[b.topologyRole] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
  }

  // Within entry layer: active proxy before standby
  if (a.topologyLayer === "entry" && b.topologyLayer === "entry") {
    const roleA = ROLE_IMPORTANCE[a.topologyRole] ?? 99;
    const roleB = ROLE_IMPORTANCE[b.topologyRole] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
  }

  // Deterministic fallback
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id - b.id;
}

// --- Generic fallback comparison ---
function compareNodesGeneric(a: TopologyNode, b: TopologyNode): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const typeOrderA = TYPE_DISPLAY_ORDER[a.resourceType] ?? 99;
  const typeOrderB = TYPE_DISPLAY_ORDER[b.resourceType] ?? 99;
  if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id - b.id;
}

function compareEdges(a: TopologyEdge, b: TopologyEdge): number {
  if (a.relationType !== b.relationType) return a.relationType.localeCompare(b.relationType);
  if (a.fromResourceId !== b.fromResourceId) return a.fromResourceId - b.fromResourceId;
  if (a.toResourceId !== b.toResourceId) return a.toResourceId - b.toResourceId;
  return a.id - b.id;
}

// --- Generic column index ---
function getGenericColumnIndex(node: TopologyNode): number {
  const distance = typeof node.distance === "number" ? node.distance : 0;
  return distance;
}

/**
 * Layout a single horizontal row of nodes at the given y position,
 * centered around centerX. Multi-node rows spread horizontally.
 */
function layoutLayerRow(
  nodes: TopologyNode[],
  centerX: number,
  baseY: number,
  positions: Map<number, { x: number; y: number }>,
): number {
  if (nodes.length === 0) return baseY;

  if (nodes.length === 1) {
    positions.set(nodes[0].id, { x: centerX, y: baseY });
    return baseY + ROW_HEIGHT + LAYER_GAP;
  }

  // Spread horizontally around center
  const totalWidth = (nodes.length - 1) * COLUMN_WIDTH;
  const startX = centerX - totalWidth / 2;

  for (let i = 0; i < nodes.length; i++) {
    positions.set(nodes[i].id, { x: startX + i * COLUMN_WIDTH, y: baseY });
  }

  return baseY + ROW_HEIGHT + LAYER_GAP;
}

/** Result of computing group box + replication layout. */
type DatabaseLayoutResult = {
  positions: Map<number, { x: number; y: number }>;
  /** Group box node IDs keyed by the cluster node they replace. */
  clusterToGroupMap: Map<number, string>;
  /** Group box node data for rendering. */
  groupBoxNodes: Array<{
    id: string;
    position: { x: number; y: number };
    width: number;
    height: number;
    data: GroupBoxData;
  }>;
  /** Root cluster node IDs — used to keep membership edges targeting root directly. */
  rootClusterNodeIds: Set<number>;
};

/**
 * Phase 15B-fix: Vertical layer layout for database topology.
 *
 * Layers are stacked top-to-bottom:
 *   Application → Entry/Proxy → [Group Box: Primary → Replicas] → Control Plane → Host
 *
 * Cluster nodes are removed and replaced by a group box that wraps the
 * replication nodes. The cluster label becomes the group box title.
 */
function computeDatabaseLayout(sortedNodes: TopologyNode[]): DatabaseLayoutResult {
  const positions = new Map<number, { x: number; y: number }>();
  const clusterToGroupMap = new Map<number, string>();
  const groupBoxNodes: DatabaseLayoutResult["groupBoxNodes"] = [];
  const rootClusterNodeIds = new Set<number>();

  // Group nodes by layer
  const appNodes = sortedNodes.filter((n) => n.topologyLayer === "application");
  const entryNodes = sortedNodes.filter((n) => n.topologyLayer === "entry");
  const clusterNodes = sortedNodes.filter((n) => n.topologyLayer === "cluster");
  const replNodes = sortedNodes.filter((n) => n.topologyLayer === "replication");
  const cpNodes = sortedNodes.filter((n) => n.topologyLayer === "control_plane");
  const hostNodes = sortedNodes.filter((n) => n.topologyLayer === "host");
  const otherNodes = sortedNodes.filter(
    (n) =>
      !["application", "entry", "cluster", "replication", "control_plane", "host"].includes(
        n.topologyLayer ?? "",
      ),
  );

  // Compute horizontal center from replication area width
  const maxDepth =
    replNodes.length > 0
      ? Math.max(
          ...replNodes.map((n) => (typeof n.replicationDepth === "number" ? n.replicationDepth : 0)),
        )
      : 0;
  const centerX = (maxDepth * COLUMN_WIDTH) / 2;

  // Root cluster nodes to position inside the group box
  const rootClusterNodes = clusterNodes.filter((n) => n.isRoot);

  let y = 0;

  // --- Application layer (topmost) ---
  y = layoutLayerRow(appNodes, centerX, y, positions);

  // --- Entry/Proxy layer ---
  y = layoutLayerRow(entryNodes, centerX, y, positions);

  // --- Cluster + Replication area (inside group box) ---
  if (rootClusterNodes.length > 0 || replNodes.length > 0) {
    // Position root cluster nodes at the top of the area
    for (const root of rootClusterNodes) {
      positions.set(root.id, { x: centerX, y });
    }
    if (rootClusterNodes.length > 0) {
      y += ROW_HEIGHT;
    }

    // Position replication nodes by depth
    if (replNodes.length > 0) {
      const depthGroups = new Map<number, TopologyNode[]>();
      for (const node of replNodes) {
        const depth = typeof node.replicationDepth === "number" ? node.replicationDepth : 0;
        const group = depthGroups.get(depth) ?? [];
        group.push(node);
        depthGroups.set(depth, group);
      }

      const maxGroupSize = Math.max(...[...depthGroups.values()].map((g) => g.length), 1);

      for (const [depth, groupNodes] of depthGroups) {
        const x = depth * COLUMN_WIDTH;
        const groupHeight = (groupNodes.length - 1) * ROW_HEIGHT;
        const totalHeight = (maxGroupSize - 1) * ROW_HEIGHT;
        const offsetY = (totalHeight - groupHeight) / 2;

        for (let i = 0; i < groupNodes.length; i++) {
          positions.set(groupNodes[i].id, { x, y: y + offsetY + i * ROW_HEIGHT });
        }
      }

      y += (maxGroupSize - 1) * ROW_HEIGHT + ROW_HEIGHT;
    }

    // Only create group box when cluster nodes exist
    if (clusterNodes.length > 0) {
      // Compute group box bounding box from root cluster + replication nodes
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      const allBoxedNodes = [...rootClusterNodes, ...replNodes];
      for (const node of allBoxedNodes) {
        const pos = positions.get(node.id);
        if (pos) {
          minX = Math.min(minX, pos.x);
          maxX = Math.max(maxX, pos.x);
          minY = Math.min(minY, pos.y);
          maxY = Math.max(maxY, pos.y);
        }
      }

      // Create ONE group box using an available cluster's label.
      const groupBoxId = "group-box";
      const namedCluster = clusterNodes.find((node) => node.displayName || node.name);
      const label = namedCluster?.displayName || namedCluster?.name || "";

      groupBoxNodes.push({
        id: groupBoxId,
        position: {
          x: minX - GROUP_PADDING,
          y: minY - GROUP_PADDING - GROUP_LABEL_HEIGHT,
        },
        width: maxX - minX + 320 + GROUP_PADDING * 2,
        height: maxY - minY + ROW_HEIGHT + GROUP_PADDING * 2 + GROUP_LABEL_HEIGHT,
        data: { label, role: "cluster" },
      });

      // Map ALL cluster nodes (including root) to the group box for edge retargeting.
      // External edges (traffic, management, monitoring) will target the group box.
      // Membership edges are later overridden to target the root node directly.
      for (const cn of clusterNodes) {
        clusterToGroupMap.set(cn.id, groupBoxId);
        if (cn.isRoot) {
          rootClusterNodeIds.add(cn.id);
        }
      }
    }

    y += LAYER_GAP;
  }

  // --- Control Plane ---
  y = layoutLayerRow(cpNodes, centerX, y, positions);

  // --- Host / Placement ---
  y = layoutLayerRow(hostNodes, centerX, y, positions);

  // --- Any remaining nodes ---
  layoutLayerRow(otherNodes, centerX, y, positions);

  return { positions, clusterToGroupMap, groupBoxNodes, rootClusterNodeIds };
}

function computeGenericLayout(sortedNodes: TopologyNode[]): Map<number, { x: number; y: number }> {
  const positions = new Map<number, { x: number; y: number }>();

  const columns = new Map<number, TopologyNode[]>();
  for (const node of sortedNodes) {
    const columnIndex = getGenericColumnIndex(node);
    const col = columns.get(columnIndex) ?? [];
    col.push(node);
    columns.set(columnIndex, col);
  }

  const maxColumnSize = Math.max(...[...columns.values()].map((col) => col.length), 1);

  for (const [columnIndex, colNodes] of columns) {
    const x = columnIndex * COLUMN_WIDTH;
    const totalHeight = (colNodes.length - 1) * ROW_HEIGHT;
    const maxHeight = (maxColumnSize - 1) * ROW_HEIGHT;
    const offsetY = (maxHeight - totalHeight) / 2;

    for (let i = 0; i < colNodes.length; i++) {
      positions.set(colNodes[i].id, { x, y: offsetY + i * ROW_HEIGHT });
    }
  }

  return positions;
}

function isBackboneEdge(edge: TopologyEdge): boolean {
  return BACKBONE_SEMANTIC_TYPES.has(edge.semanticType);
}

/** Compute unique layer bands for visual grouping. */
function computeLayerBands(
  sortedNodes: TopologyNode[],
  positions: Map<number, { x: number; y: number }>,
): LayerBand[] {
  const layerRanges = new Map<string, { minX: number; maxX: number; minY: number; maxY: number }>();

  for (const node of sortedNodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    // Skip cluster nodes — root is inside the group box, non-root is filtered
    if (node.topologyLayer === "cluster") continue;
    const layer = node.topologyLayer ?? "generic";
    const existing = layerRanges.get(layer);
    if (existing) {
      existing.minX = Math.min(existing.minX, pos.x);
      existing.maxX = Math.max(existing.maxX, pos.x);
      existing.minY = Math.min(existing.minY, pos.y);
      existing.maxY = Math.max(existing.maxY, pos.y);
    } else {
      layerRanges.set(layer, { minX: pos.x, maxX: pos.x, minY: pos.y, maxY: pos.y });
    }
  }

  const bands: LayerBand[] = [];
  for (const [layer, range] of layerRanges) {
    bands.push({
      layerKey: layer,
      labelKey: LAYER_LABEL_KEYS[layer as TopologyLayer] ?? LAYER_LABEL_KEYS.generic,
      x: range.minX - 40,
      width: range.maxX - range.minX + 320,
      y: range.minY - 40,
      height: range.maxY - range.minY + 120,
    });
  }

  return bands;
}

export type LayerBand = {
  layerKey: string;
  labelKey: string;
  x: number;
  width: number;
  y: number;
  height: number;
};

export function mapTopologyToFlow(response: TopologyResponse): {
  nodes: Node<TopologyNodeData | GroupBoxData>[];
  edges: Edge[];
  layerBands: LayerBand[];
} {
  const isDatabase = response.isDatabaseTopology;
  const compareFn = isDatabase ? compareNodesSemantic : compareNodesGeneric;

  const sortedNodes = [...response.nodes].sort(compareFn);
  const sortedEdges = [...response.edges].sort(compareEdges);

  // Cluster node IDs for filtering (exclude root — root must always remain visible)
  const clusterNodeIds = new Set(
    sortedNodes
      .filter((n) => n.topologyLayer === "cluster" && !n.isRoot)
      .map((n) => n.id),
  );

  let positions: Map<number, { x: number; y: number }>;
  let clusterToGroupMap = new Map<number, string>();
  let groupBoxNodes: DatabaseLayoutResult["groupBoxNodes"] = [];
  let rootClusterNodeIds = new Set<number>();

  if (isDatabase) {
    const result = computeDatabaseLayout(sortedNodes);
    positions = result.positions;
    clusterToGroupMap = result.clusterToGroupMap;
    groupBoxNodes = result.groupBoxNodes;
    rootClusterNodeIds = result.rootClusterNodeIds;
  } else {
    positions = computeGenericLayout(sortedNodes);
  }

  const layerBands = isDatabase
    ? computeLayerBands(sortedNodes, positions)
    : [];

  // Build node array — skip cluster nodes (replaced by group boxes)
  const nodes: Node<TopologyNodeData | GroupBoxData>[] = [];

  for (const node of sortedNodes) {
    if (clusterNodeIds.has(node.id)) continue;

    nodes.push({
      id: String(node.id),
      type: "topologyNode",
      position: positions.get(node.id) ?? { x: 0, y: 0 },
      data: {
        ...node,
        label: node.displayName || node.name,
        layerBand: node.topologyLayer ?? null,
      },
    });
  }

  // Add group box nodes
  for (const gb of groupBoxNodes) {
    nodes.push({
      id: gb.id,
      type: "topologyGroup",
      position: gb.position,
      data: gb.data,
      style: { width: gb.width, height: gb.height },
      draggable: false,
      selectable: false,
      zIndex: -1,
    } as Node<GroupBoxData>);
  }

  // Build edge array — retarget cluster references to group box, drop membership edges
  const edges: Edge[] = [];

  for (const edge of sortedEdges) {
    let sourceId = String(edge.fromResourceId);
    let targetId = String(edge.toResourceId);

    // Retarget cluster node references to group box
    if (clusterToGroupMap.has(edge.fromResourceId)) {
      sourceId = clusterToGroupMap.get(edge.fromResourceId)!;
    }
    if (clusterToGroupMap.has(edge.toResourceId)) {
      targetId = clusterToGroupMap.get(edge.toResourceId)!;
    }

    // Membership edges: if target was retargeted from a root cluster node,
    // keep targeting the root node directly (shows internal replica→cluster
    // relationship inside the group box).
    if (isDatabase && edge.semanticType === "membership" && rootClusterNodeIds.has(edge.toResourceId)) {
      targetId = String(edge.toResourceId);
    }

    const backbone = isDatabase && isBackboneEdge(edge);

    const sourcePos = positions.get(edge.fromResourceId);
    const targetPos = positions.get(edge.toResourceId);
    const isReverse =
      sourcePos !== undefined &&
      targetPos !== undefined &&
      sourcePos.x > targetPos.x;

    // Select handles based on semantic type
    const handles = isDatabase
      ? getEdgeHandles(edge.semanticType)
      : {};

    edges.push({
      id: String(edge.id),
      source: sourceId,
      target: targetId,
      label: backbone ? edge.relationType : undefined,
      type: backbone ? "smoothstep" : "default",
      data: { semanticType: edge.semanticType },
      style: backbone
        ? { strokeWidth: 2 }
        : { opacity: 0.4, strokeWidth: 1 },
      ...(backbone ? { pathOptions: { offset: isReverse ? 40 : 20 } } : {}),
      ...handles,
    });
  }

  return { nodes, edges, layerBands };
}

export type { TopologyNodeData, GroupBoxData };
