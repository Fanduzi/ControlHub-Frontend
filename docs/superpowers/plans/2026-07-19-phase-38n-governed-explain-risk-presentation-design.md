# Phase 38N: Governed Explain And Query Risk Presentation Design

## Decision

Deliver Explain as a distinct governed operation, not as a special case of the
normal execute route and not as a generic result-table rendering of user-typed
`EXPLAIN`. This keeps execution history, data-return semantics, raw plan
parsing, and risk policy out of the browser.

```text
Worksheet statement
  -> POST /query-targets/{id}/explain
  -> fresh actor + governed target/credential resolution
  -> SELECT-only Explain guard
  -> engine-owned Explain wrapper in read-only transaction
  -> backend normalizer + bounded risk policy
  -> versioned sanitized response
  -> worksheet-local Explain panel
```

## Backend Design

### Route And Service Boundary

Register `POST /query-targets/{id}/explain` in the same fresh-actor router
group as execution. Add a dedicated request/response model and an Explain
service method rather than adding optional Explain behavior to `Execute`.

The handler decodes only `statement`, gets actor identity from middleware, and
maps sentinel service errors to existing controlled query error responses. It
must reject unknown request fields if that is the repository convention and
must never echo a statement or a database error.

The service order is:

1. Resolve the governed target/access/credential exactly as execution does.
2. Verify the target engine supports the finalized normalizer contract.
3. Parse and guard a bare `SELECT` through a narrow Explain-specific entry
   point. Do not let this route inherit user-typed Explain support from the
   generic execute guard.
4. Call a typed `Explain` executor operation with the guarded select.
5. Normalize bounded raw engine output into the public model, derive finite
   risk signals, and return the response.
6. Optionally write a fixed audit event through the existing audit boundary;
   do not persist an execution result/history record.

The executor interface must remain typed. Do not introduce a generic
`QueryBound(sql string, args ...any)` escape hatch. A MySQL implementation may
issue `EXPLAIN FORMAT=JSON <guarded select>` internally, but only after the
guard succeeds and only within a read-only transaction.

### Normalized Model

The normalizer owns engine-specific field extraction. The public model is
small, finite, and versioned:

```text
ExplainResponse
  targetResourceId, engine, formatVersion=1, nodes[], risks[], truncated

ExplainNode
  id, parentId?, operation enum, access enum, estimatedRows?, usesIndex?

ExplainRisk
  code enum, severity enum
```

The first format deliberately omits relation/index/condition/message fields.
That prevents accidental disclosure from engine plan JSON and keeps the UI
portable. Add such fields only in a separately approved contract after proving
they are sanitized and consistently available.

Define one backend cap for normalized node count and one for risk count. On a
cap hit, set `truncated=true` and add no arbitrary text. Unknown raw structures
either map to `unknown_plan_shape` or fail with controlled
`query_explain_not_supported`; choose one behavior per engine and test it.

Risk policy is backend-owned. Start with documented finite signals:

```text
full_table_scan
filesort
temporary_table
high_estimated_rows
unknown_plan_shape
```

`high_estimated_rows` must use a named, tested backend threshold. The frontend
only localizes the supplied enum and severity; it does not infer risks from
node fields or choose thresholds.

### Engine Compatibility Gate

Before writing public OpenAPI or UI availability logic, run a narrow MySQL and
TiDB compatibility spike against the actual supported versions:

- verify the server-owned Explain syntax;
- capture only test-fixture raw plans locally;
- prove the normalizer can emit every v1 enum without raw passthrough;
- verify read-only transaction and timeout behavior; and
- verify unsupported shape behavior.

Ship MySQL only if TiDB cannot satisfy that contract. In that case backend
target capability returns `explain=false` for TiDB and direct endpoint calls
return the fixed unsupported error. Do not pretend that one engine's plan is a
portable format.

### Persistence And Audit

Explain is not a query execution result. It must not create a
`query_executions` row, result record, or history item. If policy requires
audit, use a fixed event type such as `query.explain` and a fixed outcome; do
not store the statement digest, preview, raw plan, normalized node values,
credentials, or driver error. Add direct integration assertions against audit
and execution tables rather than relying on application-level mocks.

## Frontend Design

### State Machine

Keep Explain state inside the existing worksheet model:

```text
explain: {
  status: idle | loading | ready | error,
  requestGeneration,
  statementIdentity | null,
  targetId | null,
  response | null,
  errorCode | null
}
```

Capture the trigger element synchronously on keyboard or mouse activation.
When requesting Explain, increment the generation and capture worksheet ID,
target ID, statement identity, and generation. Apply a response only if all
four still match. Use `AbortController` where the service client supports it;
generation equality remains the final stale-response guard.

Invalidate Explain before any state transition that makes it misleading:

- every statement edit;
- format only when formatted SQL differs;
- Run start;
- execution retarget and target switch;
- worksheet close and unmount; and
- a new Explain request.

Do not revive a prior plan if the operator changes SQL back to the same text.
An invalidated generation stays invalidated until a new Explain completes.

### Presentation

Place Explain in the established result area as an independent, locally
closable panel. It has no copy, download, editor insertion, query link, or raw
JSON mode. Nodes use compact semantic labels and risk badges, with a clearly
localized truncated notice. No table-identifier, predicate, or free-form plan
text is rendered in v1.

On desktop, preserve the current editor/result geometry. At mobile widths, use
the existing local responsive result pattern rather than adding a fixed third
column or changing shared overlay primitives. The trigger retains keyboard
access; Escape and Close restore focus only to the originally captured,
still-connected button.

### Availability

Use a backend target capability, not frontend engine sniffing, to decide whether
to show the action. Disable it while Run or Explain is in flight. A direct API
unsupported error must render a controlled unavailable state, not a raw error.

## Rejected Alternatives

- **Send `EXPLAIN SELECT` from the browser:** duplicates safety-sensitive SQL
  construction and makes Explain guard behavior depend on user syntax.
- **Reuse `/execute` and render its table:** mixes Explain with result history
  and makes raw plan fields available to a generic grid.
- **Return raw JSON plus a generic tree:** leaks arbitrary engine fields and
  cannot provide a stable cross-engine public contract.
- **Frontend risk scoring:** makes thresholds and interpretation ungoverned and
  inconsistent across clients.
- **Persist plans for comparison:** expands retention, disclosure, and audit
  requirements beyond this milestone.

## Verification Shape

Backend tests must prove bare SELECT-only acceptance, typed Explain rejection,
no bare statement execution, target/credential enforcement, typed executor
usage, normalized enum/cap behavior, fixed errors, no raw plan leakage, no
execution-history persistence, fixed audit behavior, MySQL integration, OpenAPI
validation, and OpenAPI fuzzing.

Frontend tests must prove service request shape, no actor/credential/plan
fields, availability, loading/error/retry, stale statement/target/worksheet
rejection, local panel close/focus behavior, EN/ZH labels, and mobile layout.

Real E2E must run against exact backend/frontend commits, a ready governed
target, and a fixture statement designed to trigger at least one deterministic
risk. It must assert normal Run still returns its own result, Explain creates
no extra execution history item, raw plan text/literals are absent, focus
restores, and no E2E test fails or skips.
