import type { Edge, Node } from "@xyflow/react";
import type { EdgeSemanticType, TopologyEdge, TopologyLayer, TopologyNode, TopologyResponse, TopologyRole } from "@/types/resource";

type TopologyNodeData = TopologyNode & {
  label: string;
};

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 120;

// --- Database semantic layer ordering ---
// Left-to-right: application → entry → cluster → replication (by depth) → control_plane → host
const SEMANTIC_LAYER_ORDER: Record<TopologyLayer, number> = {
  application: 0,
  entry: 1,
  cluster: 2,
  replication: 3,
  control_plane: 4,
  host: 5,
  generic: 6,
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

// --- Database semantic comparison ---
function compareNodesSemantic(a: TopologyNode, b: TopologyNode): number {
  // 1. Layer ordering
  const layerA = SEMANTIC_LAYER_ORDER[a.topologyLayer] ?? 99;
  const layerB = SEMANTIC_LAYER_ORDER[b.topologyLayer] ?? 99;
  if (layerA !== layerB) return layerA - layerB;

  // 2. Within replication layer: sort by replicationDepth
  if (a.topologyLayer === "replication" && b.topologyLayer === "replication") {
    if (a.replicationDepth !== b.replicationDepth) {
      return a.replicationDepth - b.replicationDepth;
    }
    // Same depth: intermediate (has children) before leaf
    const roleA = ROLE_IMPORTANCE[a.topologyRole] ?? 99;
    const roleB = ROLE_IMPORTANCE[b.topologyRole] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
  }

  // 3. Within entry layer: active proxy before standby
  if (a.topologyLayer === "entry" && b.topologyLayer === "entry") {
    const roleA = ROLE_IMPORTANCE[a.topologyRole] ?? 99;
    const roleB = ROLE_IMPORTANCE[b.topologyRole] ?? 99;
    if (roleA !== roleB) return roleA - roleB;
  }

  // 4. Deterministic fallback: name then id
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

  // For replication layer, spread by depth to expand the tree rightward
  if (node.topologyLayer === "replication") {
    // layer base is 3, add replication depth to expand rightward
    return layerOrder + node.replicationDepth;
  }

  return layerOrder;
}

// --- Generic column index ---
// For non-database topologies, use distance-based columns
function getGenericColumnIndex(node: TopologyNode): number {
  return node.distance;
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

export function mapTopologyToFlow(response: TopologyResponse): {
  nodes: Node<TopologyNodeData>[];
  edges: Edge[];
} {
  const isDatabase = response.isDatabaseTopology;
  const compareFn = isDatabase ? compareNodesSemantic : compareNodesGeneric;
  const layoutFn = isDatabase ? computeDatabaseLayout : computeGenericLayout;

  const sortedNodes = [...response.nodes].sort(compareFn);
  const sortedEdges = [...response.edges].sort(compareEdges);
  const positions = layoutFn(sortedNodes);

  const nodes: Node<TopologyNodeData>[] = sortedNodes.map((node) => ({
    id: node.id,
    type: "topologyNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      ...node,
      label: node.displayName || node.name,
    },
  }));

  const edges: Edge[] = sortedEdges.map((edge) => {
    const backbone = isDatabase && isBackboneEdge(edge);

    return {
      id: edge.id,
      source: edge.fromResourceId,
      target: edge.toResourceId,
      label: edge.relationType,
      type: "smoothstep",
      data: { semanticType: edge.semanticType },
      style: backbone
        ? undefined
        : { opacity: 0.4 },
      sourceHandle: backbone ? "source" : undefined,
      targetHandle: backbone ? "target" : undefined,
    };
  });

  return { nodes, edges };
}

export type { TopologyNodeData };
