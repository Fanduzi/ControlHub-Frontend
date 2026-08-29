# topology

Topology graph presentation primitives.

`TopologyControls` exposes localized depth, direction, and relation-type
filters. Resource relation filters are URL-synchronized by `TopologyPanel`;
environment topology keeps its existing root/depth controls.

## Members

- `topology-nodes.tsx` renders localized topology nodes and cluster group labels.

## Interfaces

- `TopologyGroupComponent` renders a named cluster label or its localized role fallback.

## Dependencies

- Upstream: mapped topology graph data and root translations.
- Downstream: `TopologyPanel` React Flow node registration.
