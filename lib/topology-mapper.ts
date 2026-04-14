import type { Edge, Node } from "@xyflow/react";
import type { TopologyEdge, TopologyNode, TopologyResponse } from "@/types/resource";

type TopologyNodeData = TopologyNode & {
  label: string;
};

function compareNodes(a: TopologyNode, b: TopologyNode): number {
  if (a.distance !== b.distance) return a.distance - b.distance;
  if (a.resourceType !== b.resourceType) return a.resourceType.localeCompare(b.resourceType);
  if (a.name !== b.name) return a.name.localeCompare(b.name);
  return a.id.localeCompare(b.id);
}

function compareEdges(a: TopologyEdge, b: TopologyEdge): number {
  if (a.relationType !== b.relationType) return a.relationType.localeCompare(b.relationType);
  if (a.fromResourceId !== b.fromResourceId) return a.fromResourceId.localeCompare(b.fromResourceId);
  if (a.toResourceId !== b.toResourceId) return a.toResourceId.localeCompare(b.toResourceId);
  return a.id.localeCompare(b.id);
}

export function mapTopologyToFlow(response: TopologyResponse): {
  nodes: Node<TopologyNodeData>[];
  edges: Edge[];
} {
  const sortedNodes = [...response.nodes].sort(compareNodes);
  const sortedEdges = [...response.edges].sort(compareEdges);

  const nodes: Node<TopologyNodeData>[] = sortedNodes.map((node) => ({
    id: node.id,
    type: "topologyNode",
    position: { x: 0, y: 0 },
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
  }));

  return { nodes, edges };
}

export type { TopologyNodeData };
