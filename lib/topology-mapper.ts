import type { Edge, Node } from "@xyflow/react";
import type { EdgeSemanticType, TopologyEdge, TopologyLayer, TopologyNode, TopologyResponse, TopologyRole } from "@/types/resource";

type TopologyNodeData = TopologyNode & {
  label: string;
  /** Layer band label for visual grouping */
  layerBand: string | null;
};

const COLUMN_WIDTH = 360;
const ROW_HEIGHT = 140;

// --- Database semantic layer ordering ---
// application → entry → cluster → replication (by depth) → control_plane → host
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
  "membership",
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
      // Traffic flows vertically: source bottom → target top
      return {
        sourceHandle: HANDLE_SOURCE_BOTTOM,
        targetHandle: HANDLE_TARGET_TOP,
      };
    case "management":
    case "monitoring":
      // Control-plane edges: source top → target bottom (upward flow)
      return {
        sourceHandle: HANDLE_SOURCE_TOP,
        targetHandle: HANDLE_TARGET_BOTTOM,
      };
    case "placement":
      // Host placement: vertical from database to host
      return {
        sourceHandle: HANDLE_SOURCE_BOTTOM,
        targetHandle: HANDLE_TARGET_TOP,
      };
    case "membership":
      // Membership: horizontal handles for cluster→member
      return {
        sourceHandle: HANDLE_SOURCE_RIGHT,
        targetHandle: HANDLE_TARGET_LEFT,
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
  return a.id.localeCompare(b.id);
}

// --- Generic fallback comparison ---
function compareNodesGeneric(a: TopologyNode, b: TopologyNode): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const typeOrderA = TYPE_DISPLAY_ORDER[a.resourceType] ?? 99;
  const typeOrderB = TYPE_DISPLAY_ORDER[b.resourceType] ?? 99;
  if (typeOrderA !== typeOrderB) return typeOrderA - typeOrderB;
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id.localeCompare(b.id);
}

function compareEdges(a: TopologyEdge, b: TopologyEdge): number {
  if (a.relationType !== b.relationType) return a.relationType.localeCompare(b.relationType);
  if (a.fromResourceId !== b.fromResourceId) return a.fromResourceId.localeCompare(b.fromResourceId);
  if (a.toResourceId !== b.toResourceId) return a.toResourceId.localeCompare(b.toResourceId);
  return a.id.localeCompare(b.id);
}

// --- Database semantic column index ---
function getSemanticColumnIndex(node: TopologyNode): number {
  const layerOrder = SEMANTIC_LAYER_ORDER[node.topologyLayer] ?? 6;

  // For replication layer, spread by depth to expand rightward
  if (node.topologyLayer === "replication") {
    const depth = typeof node.replicationDepth === "number" ? node.replicationDepth : 0;
    return layerOrder + depth;
  }

  return layerOrder;
}

// --- Generic column index ---
function getGenericColumnIndex(node: TopologyNode): number {
  const distance = typeof node.distance === "number" ? node.distance : 0;
  return distance;
}

function computeDatabaseLayout(sortedNodes: TopologyNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  const columns = new Map<number, TopologyNode[]>();
  for (const node of sortedNodes) {
    const columnIndex = getSemanticColumnIndex(node);
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

function computeGenericLayout(sortedNodes: TopologyNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

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
  positions: Map<string, { x: number; y: number }>,
): Array<{ layerKey: string; labelKey: string; x: number; width: number }> {
  const layerXRanges = new Map<string, { minX: number; maxX: number }>();

  for (const node of sortedNodes) {
    const pos = positions.get(node.id);
    if (!pos) continue;
    const layer = node.topologyLayer ?? "generic";
    const existing = layerXRanges.get(layer);
    if (existing) {
      existing.minX = Math.min(existing.minX, pos.x);
      existing.maxX = Math.max(existing.maxX, pos.x);
    } else {
      layerXRanges.set(layer, { minX: pos.x, maxX: pos.x });
    }
  }

  const bands: Array<{ layerKey: string; labelKey: string; x: number; width: number }> = [];
  for (const [layer, range] of layerXRanges) {
    bands.push({
      layerKey: layer,
      labelKey: LAYER_LABEL_KEYS[layer as TopologyLayer] ?? LAYER_LABEL_KEYS.generic,
      x: range.minX - 40,
      width: range.maxX - range.minX + 320,
    });
  }

  return bands;
}

export type LayerBand = {
  layerKey: string;
  labelKey: string;
  x: number;
  width: number;
};

export function mapTopologyToFlow(response: TopologyResponse): {
  nodes: Node<TopologyNodeData>[];
  edges: Edge[];
  layerBands: LayerBand[];
} {
  const isDatabase = response.isDatabaseTopology;
  const compareFn = isDatabase ? compareNodesSemantic : compareNodesGeneric;
  const layoutFn = isDatabase ? computeDatabaseLayout : computeGenericLayout;

  const sortedNodes = [...response.nodes].sort(compareFn);
  const sortedEdges = [...response.edges].sort(compareEdges);
  const positions = layoutFn(sortedNodes);

  const layerBands = isDatabase
    ? computeLayerBands(sortedNodes, positions)
    : [];

  const nodes: Node<TopologyNodeData>[] = sortedNodes.map((node) => ({
    id: node.id,
    type: "topologyNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      ...node,
      label: node.displayName || node.name,
      layerBand: node.topologyLayer ?? null,
    },
  }));

  const edges: Edge[] = sortedEdges.map((edge) => {
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

    return {
      id: edge.id,
      source: edge.fromResourceId,
      target: edge.toResourceId,
      label: backbone ? edge.relationType : undefined,
      type: backbone ? "smoothstep" : "default",
      data: { semanticType: edge.semanticType },
      style: backbone
        ? { strokeWidth: 2 }
        : { opacity: 0.4, strokeWidth: 1 },
      ...(backbone ? { pathOptions: { offset: isReverse ? 40 : 20 } } : {}),
      ...handles,
    };
  });

  return { nodes, edges, layerBands };
}

export type { TopologyNodeData };
