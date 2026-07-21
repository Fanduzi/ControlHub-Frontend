# Phase 38O: Governed Relationship Map

## Status

Draft. This is the next proposed cross-repository milestone after Phase 38N.
It defines a bounded ER-style relationship map, not a full-schema browser or
database administration surface.

## Goal

An authorized operator inspecting a base table can open a clear, responsive map
of that table's direct inbound and outbound foreign-key relationships. The map
must come from one target-governed backend response, remain bounded, and expose
only schema metadata already approved for the Object Inspector.

## User Outcome

From a loaded base-table Inspector, an operator selects **View relationships**.
The Workbench displays the selected table as the root, direct inbound tables on
one side, direct outbound tables on the other, and the approved FK column
mapping for each edge. The map is read-only and local to the Inspector session.
It does not execute SQL, fetch result rows, change the worksheet, or create a
history entry.

## Scope

### Included

- A fresh-actor, target-scoped relationship-map endpoint for one selected base
  table.
- One-hop outbound FKs declared by the root table and one-hop inbound FKs that
  directly reference the root table.
- A versioned, bounded node/edge response with explicit truncation.
- Existing schema access resolution, credential binding, schema cache,
  singleflight, controlled errors, and fixed audit conventions.
- A local Object Inspector action and accessible relationship-map surface for
  desktop, mobile, English, and Simplified Chinese.
- MySQL integration proof using the dedicated schema fixture and real E2E.

### Explicitly Excluded

- Full-database, recursive, arbitrary-depth, or cross-target graph traversal.
- Browser-side N+1 object-detail crawling or browser-generated metadata SQL.
- Graph search, saved layouts, URL/local-storage/session-storage persistence,
  export, copy, download, image generation, drag/drop, editing, pan/zoom
  persistence, or a new global graph workspace.
- DDL, definitions, result values, relation records, query execution, SQL guard
  changes, credentials, actor selection, new engines, migrations, and shared
  Dialog/Sheet primitive changes.

## Public Contract

Add one route under the existing fresh-query-actor group:

```text
GET /query-targets/{id}/schema/relationship-map?database=<database>&name=<table>&refresh=false
```

`database` and `name` are required bounded query parameters. `name` must
resolve to a base table. Views and unsupported engines fail closed with
controlled public errors. Actor identity is derived only from verified auth
context; the browser never sends actor IDs, roles, SQL, credentials, DSNs, or
database connection values.

The server resolves the authorized target once, retrieves only the root table's
direct inbound and outbound FK metadata with parameterized information-schema
queries, applies caps, audits a fixed event/outcome, and returns a response like:

```json
{
  "targetResourceId": 616,
  "root": {
    "database": "query_e2e_aux",
    "name": "schema_parent",
    "kind": "table"
  },
  "nodes": [
    {
      "id": "root",
      "database": "query_e2e_aux",
      "name": "schema_parent",
      "kind": "table",
      "role": "root"
    },
    {
      "id": "inbound:0",
      "database": "query_e2e_aux",
      "name": "schema_child",
      "kind": "table",
      "role": "related"
    }
  ],
  "edges": [
    {
      "id": "fk_schema_child_parent",
      "direction": "inbound",
      "sourceId": "inbound:0",
      "targetId": "root",
      "columns": ["parent_id"],
      "referencedColumns": ["id"],
      "onUpdate": "RESTRICT",
      "onDelete": "RESTRICT"
    }
  ],
  "truncated": false
}
```

Node IDs are response-local opaque identifiers. Database/object/FK/column names
and referential actions are schema metadata already visible through the
governed Object Inspector. The response contains no raw information-schema
record, table definition, SQL, predicate, result row, DSN, credential, actor
identifier, or driver error.

V1 limits are at most 40 nodes and 80 edges. When a cap is reached, the server
sets `truncated=true`; the browser must show a localized notice and must not
infer that the graph is complete. Cross-database direct FK leaves may appear
only under the same authorized target and are never recursively expanded.

## Engine Decision

Run a MySQL/TiDB compatibility spike before enabling the route. MySQL is the
intended first engine. TiDB may be enabled only if it can provide equivalent
bounded inbound/outbound FK metadata under the same parameterized and tested
contract. If it cannot, its target capability reports relationship maps as
unavailable and direct calls return a controlled unsupported response. Do not
invent a lossy compatibility layer.

## Safety Boundary

- The backend remains the access-control and metadata authority.
- The browser makes one explicit relationship-map request only after user
  activation; opening an Inspector must not prefetch a graph.
- Relationship-map reads do not create query execution/history rows. If audit
  records an attempt, it uses fixed event/outcome metadata and never stores raw
  relation payloads, values, credentials, or driver errors.
- The frontend keeps graph state only while the Inspector session is relevant.
  It aborts or rejects stale responses on target change, root change, Inspector
  close, object collapse, worksheet close, and unmount.
- The map is read-only. It may use node selection to open an already authorized
  Inspector object, but it must not trigger graph recursion or related-record
  execution.

## Completion Standard

Phase 38O is complete only when exact final backend and frontend commits prove:

- one request returns the direct inbound and outbound relationships of a base
  table without browser N+1 metadata fetching;
- malformed parameters, views, denied targets, unsupported engines, and stale
  responses fail closed with controlled behavior;
- composite FK column ordering, direction, node/edge caps, and truncation are
  deterministic;
- no execution/history row, raw SQL, raw metadata record, credential, actor
  identifier, result value, or driver message reaches persistence, HTTP, UI,
  URL, or browser storage;
- Inspector open does not prefetch; the explicit map action is keyboard
  accessible; close restores focus only to a connected trigger;
- desktop English, 375px mobile English, and desktop Simplified Chinese E2E
  pass with zero failures and zero skips; and
- existing schema explorer, Inspector, table definition, FK record navigation,
  Explain, history, and result-grid flows remain green.
