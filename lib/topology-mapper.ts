import type { Edge, Node } from "@xyflow/react";
import type { TopologyEdge, TopologyNode, TopologyResponse } from "@/types/resource";

type TopologyNodeData = TopologyNode & {
  label: string;
};

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 120;

// Semantic ordering: put database infrastructure types in a natural hierarchy order
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

function getTypeOrder(resourceType: string): number {
  return TYPE_DISPLAY_ORDER[resourceType] ?? 99;
}

function compareNodes(a: TopologyNode, b: TopologyNode): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  const typeOrderA = getTypeOrder(a.resourceType);
  const typeOrderB = getTypeOrder(b.resourceType);
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

function computeLayout(sortedNodes: TopologyNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  // Group nodes by distance
  const columns = new Map<number, TopologyNode[]>();
  for (const node of sortedNodes) {
    const col = columns.get(node.distance) ?? [];
    col.push(node);
    columns.set(node.distance, col);
  }

  const maxColumnSize = Math.max(...[...columns.values()].map((col) => col.length), 1);

  for (const [distance, colNodes] of columns) {
    const x = distance * COLUMN_WIDTH;
    // Center each column vertically relative to the tallest column
    const totalHeight = (colNodes.length - 1) * ROW_HEIGHT;
    const maxHeight = (maxColumnSize - 1) * ROW_HEIGHT;
    const offsetY = (maxHeight - totalHeight) / 2;

    for (let i = 0; i < colNodes.length; i++) {
      positions.set(colNodes[i].id, { x, y: offsetY + i * ROW_HEIGHT });
    }
  }

  return positions;
}

export function mapTopologyToFlow(response: TopologyResponse): {
  nodes: Node<TopologyNodeData>[];
  edges: Edge[];
} {
  const sortedNodes = [...response.nodes].sort(compareNodes);
  const sortedEdges = [...response.edges].sort(compareEdges);
  const positions = computeLayout(sortedNodes);

  const nodes: Node<TopologyNodeData>[] = sortedNodes.map((node) => ({
    id: node.id,
    type: "topologyNode",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      ...node,
      label: node.displayName || node.name,
    },
  }));

  const edges: Edge[] = sortedEdges.map((edge) => ({
    id: edge.id,
    source: edge.fromResourceId,
    target: edge.toResourceId,
    label: edge.relationType,
    type: "smoothstep",
  }));

  return { nodes, edges };
}

export type { TopologyNodeData };
