# Phase 38O: Governed Relationship Map Design

## Architecture

Phase 38O is a root-table relationship query, not a client-composed schema
graph. Existing object details provide outbound FKs only; discovering inbound
relations by opening neighbour details would be incomplete and would create
unbounded N+1 metadata traffic. The backend must retrieve both directions in
one bounded operation.

```text
Object Inspector action
  -> GET relationship-map(database, name)
  -> fresh actor + governed target/credential resolution
  -> base-table validation
  -> parameterized outbound + inbound information-schema reads
  -> cap, normalize, cache, fixed audit
  -> bounded nodes/edges response
  -> Inspector-local accessible map
```

## Backend Design

### Route And Model

Register `GET /query-targets/{id}/schema/relationship-map` beside existing
schema routes in the fresh-query-actor group. Add dedicated public models:

```text
RelationshipMapResponse
  targetResourceId, root, nodes[], edges[], truncated

RelationshipMapNode
  id, database, name, kind=table, role=root|related

RelationshipMapEdge
  id, direction=inbound|outbound, sourceId, targetId,
  columns[], referencedColumns[], onUpdate, onDelete
```

All collection fields must serialize as empty arrays rather than `null`. Node
IDs are generated per response and are opaque to the browser; the browser may
not derive access scope from them. All public strings are bounded according to
existing schema metadata limits.

### Inspector And Service Boundary

Extend the typed schema inspector with a root-table relationship-map operation.
It must verify root table existence/type and run parameterized
information-schema reads for:

- outbound constraints where the root is the child table; and
- inbound constraints where the root is the referenced parent table.

Group composite constraints by name while preserving ordinal column order.
Use the existing read-only metadata connection/transaction conventions. The
browser never supplies identifiers for generated SQL; `database` and `name`
remain bounded handler parameters passed into bound queries.

The service resolves target access before cache or inspection. Its cache key
must include target ID, credential reference, root database, root name, and
refresh context. Apply a server-side cap of 40 nodes and 80 edges in stable
order, set `truncated=true` when either cap prevents inclusion, and do not
silently return a partial graph as complete. Reuse singleflight to coalesce
identical concurrent requests.

The service writes one fixed relationship-map audit event/outcome and never
persists `query_executions`, result rows, definitions, or raw inspector errors.
Handler errors use existing controlled schema error mapping. The initial engine
capability is established by a MySQL/TiDB metadata compatibility spike; unsafe
or unsupported engines advertise unavailable and fail closed.

## Frontend Design

### Request Lifecycle

Add a typed `getRelationshipMap` service client and response types next to
existing schema clients. The Object Inspector owns request state:

```text
status: idle | loading | ready | error
generation
targetId
root identity: database + table name
response | null
error code | null
trigger element | null
```

The user explicitly activates **View relationships**. Inspector open, object
expand, and object-details load must make no relationship-map request. Capture
the trigger synchronously. On close, target/root change, object collapse,
Inspector close, worksheet close, or unmount, abort the request when possible,
advance generation, clear state, and reject late writes unless target/root/
generation still match.

Do not add graph payloads to `QuerySchemaStore` in v1. Its five-minute detail
cache is for object details; relationship maps are ephemeral Inspector state so
they cannot outlive the selected target/root or expand browser metadata memory.

### Presentation And Accessibility

Render a deterministic bounded layout without a graph/canvas dependency:

- root table in the centre;
- inbound related tables in a left semantic list/column;
- outbound related tables in a right semantic list/column;
- each edge exposes direction and column mapping in visible compact text and an
  equivalent screen-reader relationship summary.

Use normal DOM/SVG only for decoration; semantic content must remain reachable
without interpreting geometry. Reuse the Inspector's existing local
Dialog/Sheet responsive behavior rather than changing shared primitives or
adding a fixed third Workbench column. Use localized EN/ZH labels for action,
loading, empty, error, retry, inbound/outbound, mapping, truncation, and close.

The map is read-only. A related node may open that object's existing Inspector
entry only if it is already valid under the active target and does not fetch a
second map automatically. Do not add recursive expansion, pan/zoom persistence,
dragging, exports, or copy controls.

## Rejected Alternatives

- **Build the graph from object-details in the browser:** object details only
  guarantee outbound FKs and recursive fetching creates N+1 requests and stale
  target races.
- **Full database ER graph:** makes metadata volume, layout, authorization
  review, cache policy, and mobile usability unbounded.
- **Third-party graph canvas:** unnecessary for a 40-node bounded map and adds
  dependency, keyboard, and mobile complexity without changing the governed
  contract.
- **Cache graph payloads in the shared browser schema store:** makes target/root
  invalidation harder and expands the lifetime of metadata unnecessarily.
- **Expose raw information-schema rows:** leaks implementation fields and has no
  stable cross-engine public contract.

## Verification Shape

Backend: model JSON invariants; inspector/service/handler tests for validation,
access, directions, composite ordering, caps, cache, audit and controlled
errors; real MySQL integration rooted at `schema_parent` and `schema_child`;
OpenAPI validation and fuzzing.

Frontend: service request/response tests; Inspector tests for no prefetch,
explicit request, loading/error/truncation, stale target/root closure,
semantic map content, localized labels and connected-trigger focus restoration;
Explorer tests for collapse/target change; real Workbench E2E for desktop EN,
375px mobile EN, and desktop zh-CN with network assertions that no execute,
related-record, definition, or object-detail fan-out occurs when opening the
map.

All final gates run on exact clean feature SHAs against a ready target and
dedicated fixture. Real E2E must finish with zero failed and zero skipped tests.
