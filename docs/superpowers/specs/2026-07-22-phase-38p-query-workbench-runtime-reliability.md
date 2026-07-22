# Phase 38P: Query Workbench Runtime Reliability

## Status

Draft. This is a cross-repository reliability milestone following Phase 38O.
It is not a new query capability. It fixes verified runtime contract, hydration,
navigation, and Object Explorer usability failures before further Workbench
feature work.

## Decision

Treat Query Workbench runtime correctness as a governed, cross-repository
contract. A successful execution response always represents result collections
as JSON arrays, SSR and the first client render use the same preference-neutral
state, URL writes are idempotent, and the Object Explorer remains usable within
the available desktop editor space.

## Evidence At Planning Time

The following are confirmed against backend `766ab8d` and frontend `bd66023`:

- `internal/service/query_executor.go` initializes a zero-row result with a
  nil `Rows` slice. Go JSON encodes that as `"rows": null`.
- `components/query/query-editor-shell.tsx` renders `rows.length`; a valid
  zero-row response therefore caused a browser `TypeError`.
- `components/query/query-workbench.tsx` reads Object Explorer preferences
  from `localStorage` during state initialization. Server rendering uses
  closed/default state while the browser can use persisted state, which caused
  React hydration recovery on `/query`.
- The same component calls `router.replace` from an `activeDatabase` effect
  without first proving the URL differs. Repeated `/query` route work was
  observed and must be characterized and removed only when redundant.
- The desktop Object Explorer width is capped at 280px and its search input
  shares a narrow row with actions. Operators cannot expand the pane enough to
  read or use the search control comfortably.
- The query E2E fixture has previously drifted from credential metadata. Test
  failures then appear as many generic schema/query timeouts instead of one
  safe setup failure.

## User Outcomes

- A valid zero-row Run or governed related-record read shows an empty result
  state and never crashes the Workbench.
- Opening `/query` with saved Object Explorer preferences produces no hydration
  mismatch or client-side regeneration.
- Selecting or clearing an active database updates the URL once when needed
  and performs no redundant navigation when the URL is already canonical.
- On a normal desktop viewport, operators can widen the Objects pane beyond
  280px while the SQL editor remains usable; the object-search input is visibly
  usable at the minimum pane width.
- A missing or mismatched local E2E fixture fails early with a fixed,
  non-sensitive readiness diagnostic.

## Scope

### Included

- Backend empty-result JSON array invariant for normal Run and governed
  related-record responses that share the bounded row scanner.
- Frontend mixed-version response containment so malformed result collections
  cannot crash `ResultTable`.
- SSR-safe Object Explorer preference hydration and delayed persistence.
- Idempotent Workbench database URL synchronization.
- Responsive, accessible desktop Objects pane sizing and search-control layout.
- Deterministic, safe E2E readiness probing and regression coverage.
- Backend/frontend unit, integration, component, and real E2E proof.

### Excluded

- SQL guard, engine support, target access, actor scope, credentials, DSN
  format, migrations, new endpoints, query history semantics, persistence,
  exports, result value disclosure, and shared Dialog/Sheet primitive changes.
- New Object Explorer capabilities, graph recursion, schema search semantics,
  relationship-map behavior, Explain behavior, and query result features.
- Hiding failures with retries, global timeout increases, test skips, mocks,
  forced clicks, broad network/console allowlists, fixed sleeps, or one-worker
  acceptance runs.

## Contract Invariants

### Result collections

For every successful public `QueryExecuteResponse` and related-record response:

```json
{
  "columns": [],
  "rows": [],
  "rowCount": 0
}
```

`rows` is always an array. It is never JSON `null`. The backend owns this
invariant. The frontend retains a narrow defensive boundary for a temporarily
mixed-version backend: it may treat an otherwise consistent `rows: null` as an
empty result, but it must present a controlled error for malformed collection
shapes or inconsistent row counts. It must never throw from the result grid or
render untrusted arbitrary response data.

### Preference hydration

The server render and first client render use:

- Objects pane closed.
- Default desktop pane width.

Only after hydration may the browser read persisted Object Explorer preferences.
Initial defaults must not overwrite saved values before that read completes.
Persisted values are validated and clamped to current viewport/editor bounds.

### URL synchronization

`targetId`, `database`, and unrelated search parameters remain canonical. A
database state transition calls `router.replace` only when the desired URL
differs from the current URL. This does not add URL persistence for worksheet,
query, Inspector, history, Explain, or relationship-map state.

### Objects pane ergonomics

Desktop policy is:

- minimum width: 260px;
- default width: 320px;
- maximum width: the smaller of 560px and the viewport width remaining after a
  480px minimum editor region;
- mobile keeps the existing bottom Sheet rather than rendering a desktop pane.

The search input gets a full-width input row; localized Search/Clear controls
use a separate wrapping row. Controls remain outside treeitem ownership and
retain database-specific accessible names. The separator reports valid range
values and supports keyboard resizing if it remains interactive.

### E2E readiness

The test harness verifies a governed ready query target and schema access once
before Workbench scenarios. It reports one fixed setup error without secret
values if the fixture, credential environment, or seed metadata is unavailable.
It does not change credentials, fabricate readiness, run arbitrary SQL, or
create normal execution/history records as part of the probe.

## Safety Boundary

- No raw SQL, driver error, DSN, password, credential reference value, actor
  ID, result value, or fixture secret is added to UI, URL, storage, logs, audit,
  or test reports.
- The backend remains the authority for successful result response shape.
- The frontend does not generate SQL or introduce a generic client-side schema
  validation framework.
- Existing query governance, audit, history, relationship-map, Explain, and
  access behavior remain unchanged.

## Acceptance Standard

Phase 38P is complete only when exact final backend and frontend commits prove:

- Empty normal Run and related-record results serialize `rows: []`, never null.
- The zero-row UI is non-crashing and controlled under a mixed-version payload.
- Saved pane preferences do not produce hydration warnings/errors.
- Idle Workbench state does not produce redundant `/query` navigations.
- Desktop Object Explorer expands beyond 280px, preserves an editor minimum,
  and exposes usable localized search controls; mobile behavior remains intact.
- Fixture readiness failures are one safe, early diagnostic rather than a suite
  of timeouts.
- No regression in current schema explorer, Inspector, table definition, FK
  navigation, Explain, history, relationship map, result grid, or credentials.
- Candidate and merged-root gates pass, followed by three consecutive real E2E
  runs with zero failures and zero skips.

## Delivery Evidence

Do not replace this Draft status with Delivered until final backend/frontend
SHAs, real merged-root service provenance, three E2E totals, CI links, and any
remaining engine/fixture limitation are recorded in a dedicated evidence note.
