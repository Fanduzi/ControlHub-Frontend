# topology

Topology graph presentation primitives.

`TopologyControls` exposes localized depth, direction, and relation-type
filters. Resource relation filters are URL-synchronized by `TopologyPanel`;
environment topology synchronizes its root and depth controls too, preserving
the canonical environment slug and other topology controls on root changes.
It accepts the existing environment-control depth range of 1–4 and drops stale
requests when URL state or its environment/resource scope changes.

## Members

- `topology-nodes.tsx` renders localized topology nodes and cluster group labels.

## Interfaces

- `TopologyGroupComponent` renders a named cluster label or its localized role fallback.

## Dependencies

- Upstream: mapped topology graph data and root translations.
- Downstream: `TopologyPanel` React Flow node registration.
