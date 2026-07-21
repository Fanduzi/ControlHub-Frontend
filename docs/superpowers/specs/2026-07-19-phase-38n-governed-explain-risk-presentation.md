# Phase 38N: Governed Explain And Query Risk Presentation

## Status

Merged and verified on 2026-07-21. Phase 38N delivers governed Explain
and query risk presentation for the Query Workbench without expanding
execution, actor visibility, or data disclosure.

## Delivery Evidence

- Backend explain delivery: `9ce2dd91ca35d2c0981574d8f99bd3571267fe1e`.
- Backend fixture repair: `9a8cf1dfb19f745076c3bfe47afa5f35d2b8861c`.
- Frontend delivery: `b593ad0f0aa264998158104f7982471acf82da55`.
- Real merged-root E2E: 74 passed, 0 failed, 0 skipped.
- CI: [backend run 29750525937](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/29750525937),
  [backend run 29807643409](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/29807643409),
  and [frontend run 29750997509](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/29750997509)
  completed successfully.
- Engine decision: MySQL v1 normalized Explain is supported. TiDB advertises
  `explain=false`. Direct unsupported Explain calls return controlled HTTP 409;
  this behavior is contract-tested. No ready TiDB target existed to prove the
  runtime engine gate end-to-end.
- Fixture: `query_e2e.qe_explain_big` is a deterministic, idempotent E2E
  fixture table created solely to support the governed Explain acceptance
  statement. It produces the normalized MySQL `full_table_scan` risk. It does
  not change grants, credentials, DSN format, SQL guard, OpenAPI, or product
  data model.

## Goal

An authorized operator can request an explanation of the current read-only
worksheet statement and see a bounded, backend-normalized plan summary with
clear risk signals. The interaction must improve investigation without running
the bare statement, exposing a raw database plan, or turning the Workbench into
an unrestricted database administration tool.

## User Outcome

For a ready target that advertises Explain support, an operator can select
Explain for a non-empty worksheet containing a permitted `SELECT`. The
Workbench shows a local Explain panel with the normalized operation tree and
server-declared risk badges. The normal result grid, result selection, history,
and editor text remain unchanged.

The browser sends the worksheet statement to one governed Explain endpoint. It
never prefixes SQL with `EXPLAIN`, builds a plan query, receives a raw plan,
or decides risk severity itself.

## Scope

### Included

- A fresh-actor, target-scoped backend Explain endpoint for approved read-only
  `SELECT` statements.
- Reuse of target access resolution, credential binding, timeout, and query
  safety rules already required for governed execution.
- Backend-owned construction of the engine Explain statement and backend
  normalization into a small versioned response model.
- A worksheet-local frontend Explain state machine and responsive, read-only
  result panel with EN and Simplified Chinese labels.
- Server-declared, finite risk signals such as full scan, temporary result,
  filesort, high estimated row count, and unsupported/unknown plan shape.
- Model, service, handler, integration, OpenAPI, fuzz, component, service,
  and real E2E coverage.

### Explicitly Excluded

- Executing the bare `SELECT` as part of Explain.
- Accepting browser-supplied `EXPLAIN`, `SHOW`, `DESCRIBE`, DDL, DML, multiple
  statements, routine definitions, grants, or arbitrary engine options.
- Returning raw `EXPLAIN FORMAT=JSON` text, raw driver messages, predicates,
  literals, result values, credentials, DSNs, usernames, or actor IDs.
- A generic plan JSON viewer, copy/export/download of plans, editor insertion,
  SQL rewriting, query-plan comparison, plan history, persistence, approval,
  or cross-target aggregation.
- SQL guard widening, result-grid changes, saved queries, ER diagrams, global
  credential facets, or a new executable engine.

## Public Contract

Add one endpoint under the existing fresh-query-actor boundary:

```text
POST /query-targets/{id}/explain
```

Request:

```json
{ "statement": "SELECT ..." }
```

The request has no actor, role, credential, DSN, database connection, max-row,
or browser-generated Explain field. The server derives actor and target policy
from authenticated context and target resolution.

Successful response shape:

```json
{
  "targetResourceId": 616,
  "engine": "mysql",
  "formatVersion": 1,
  "nodes": [
    {
      "id": "0",
      "parentId": null,
      "operation": "table_access",
      "access": "full_scan",
      "estimatedRows": 120000,
      "usesIndex": false
    }
  ],
  "risks": [
    { "code": "full_table_scan", "severity": "warning" },
    { "code": "high_estimated_rows", "severity": "warning" }
  ],
  "truncated": false
}
```

`operation`, `access`, risk `code`, and severity are documented enums. Nodes
contain no raw engine strings, relation names, conditions, literals, index
names, or free-form messages in the first delivery. `estimatedRows` is an
optional non-negative estimate, not an observed result count. `truncated` is
true only when a backend safety cap removes normalized nodes or signals.

The initial supported engine set is decided by a compatibility spike. MySQL is
the intended first engine. TiDB is enabled only when the same bounded source
and normalizer contract are proven by integration tests; otherwise it advertises
Explain as unavailable and returns a controlled unsupported error for direct
calls. No compatibility approximation is permitted.

Controlled errors use the existing query error envelope. At minimum, document
validation/rejected statement, target access/not-found, unsupported Explain,
timeout, and backend failure cases. Responses must use fixed public messages
and never include raw plan or driver text.

## Backend Safety Rules

1. The Explain service resolves the target and credential through the same
   governed path as query execution before opening a database connection.
2. It accepts a bare `SELECT` only. Existing support for a user-typed
   `EXPLAIN SELECT` on the execute route does not authorize that syntax on the
   Explain route.
3. The guard parses and validates the `SELECT` before the executor receives it.
   The backend, not the browser, wraps the guarded executable statement in the
   engine Explain form.
4. The executor uses a read-only transaction and the existing deadline policy.
   It never calls the normal result executor with the bare statement.
5. A normalizer translates only known engine fields into the versioned response
   model. Unknown shape is a finite `unknown_plan_shape` signal or controlled
   unsupported error, never raw passthrough.
6. Explain does not create a `query_executions` result-history row. If the
   audit policy records an attempt, it uses a fixed event type/outcome and no
   statement, plan, literal, credential, or driver text.

## Frontend Behavior

- Explain is visible only when the active target allows it, the worksheet has a
  non-empty statement, and neither Run nor Explain is already in flight.
- The panel is worksheet-local. It does not replace a successful normal result
  or add an execution-history item.
- Statement edit, format when it changes SQL, Run start, retarget, target
  change, worksheet close, and unmount invalidate Explain state and abort or
  reject stale responses by worksheet/target/generation/statement identity.
- A newer Explain replaces only the prior Explain state for that worksheet.
  Error/retry state is localized; raw error text is never rendered.
- The panel is keyboard reachable, has an explicit localized close control,
  and restores focus to the connected Explain trigger when closed. On narrow
  screens it uses the established local responsive result surface without
  changing shared Dialog or Sheet primitives.

## Completion Standard

Phase 38N is complete only when the final clean backend and frontend commits
prove all of the following with no failed or skipped real E2E tests:

- a governed Explain request cannot execute the bare statement;
- typed Explain/non-SELECT/multi-statement/side-effecting input is rejected;
- no raw plan, predicate, literal, credential, DSN, actor ID, SQL result, or
  driver text reaches HTTP, audit/history storage, UI, URL, or local storage;
- normalized MySQL risks and node limits are deterministic under fixture data;
- unsupported engines fail closed and do not advertise a misleading action;
- statement/target/worksheet lifecycle invalidates stale Explain output;
- desktop EN, 375px mobile EN, and desktop zh-CN flows work with focus
  restoration; and
- existing Run, history, result-grid, schema explorer, table definition, and
  related-record flows remain green.
