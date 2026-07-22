# Phase 38P: Query Workbench Runtime Reliability Design

## Status

Draft. Design frozen for implementation review after baseline reproduction. It
implements the Phase 38P specification without expanding query capabilities.

## Architecture Decision

The milestone has three narrow seams:

```text
MySQL rows scanner
  -> QueryExecuteResponse / related-record response arrays
  -> frontend execution response boundary
  -> ResultTable empty state

SSR default Workbench state
  -> post-hydration preference read
  -> guarded persistence

activeDatabase state
  -> canonical desired URL comparison
  -> conditional router.replace
```

The backend fixes the public array invariant at its source. The frontend adds
only a mixed-version crash barrier, not an unrelated general-purpose JSON
validation library. Preference hydration and URL synchronization remain local
to `QueryWorkbench`; worksheet, Inspector, history, Explain, and relationship
map state are not moved or persisted.

## Backend Design

### Empty arrays at the bounded scanner

`MySQLQueryExecutor.scanBoundedRows` is shared by normal query execution and
governed related-record navigation. Initialize both collection fields to
non-nil empty slices before iteration. On a zero-row query, the service returns
the existing success response with `rows: []` and `rowCount: 0`.

Do not change:

- `QueryGuard` parsing, LIMIT enforcement, or accepted SQL;
- `TargetAccessResolver`, DSN handling, credential validation, or engine gates;
- history/audit persistence ordering; or
- row/cell/payload caps and scalar conversion.

Tests must cover the scanner/public JSON representation and a real integration
request for a valid zero-row query. The same shared invariant must be asserted
for governed related-record response if that endpoint can return zero rows.

### Compatibility expectation

The existing TypeScript contract already says `rows` is an array. This is a
bug-fix to observed serialization, not a versioned endpoint change. OpenAPI is
updated only if it currently contradicts the non-null array invariant.

## Frontend Design

### Result response containment

At the execute response boundary, normalize only this legacy-compatible case:

```text
success status + rows === null + rowCount === 0 -> rows: []
```

Any other malformed rows collection, malformed columns collection, or a
non-zero `rowCount` inconsistent with the rows collection becomes an existing
controlled query error. `ResultTable` receives only a real array. It must not
use `rows ?? []` locally because that would conceal a malformed response from
the response boundary and make contract regressions invisible.

### SSR-safe persisted Objects preferences

Use stable server/client defaults in `QueryWorkbench` state. A mount effect
sets a `preferencesHydrated` state/ref after reading both persisted keys. The
persistence effect is inert until that read finishes. This prevents the first
client render from differing from server HTML and prevents overwriting saved
open/width values with defaults.

The width value is clamped after read and on viewport changes. No storage access
is performed in a state initializer or render path.

### Idempotent URL write

Build a desired `URLSearchParams` from current params and the intended active
database. Compare its canonical string to the current `searchParams` string.
Only call `router.replace` when different. Preserve target and filter params;
the explicit target-selection handler remains responsible for clearing a stale
database selection on target change.

The test must observe navigation/request behavior rather than asserting only
that `router.replace` was called from a unit mock.

### Objects pane layout and accessibility

Use a viewport-aware maximum width:

```text
maxWidth = min(560, viewportWidth - 480)
width = clamp(storedOrDraggedWidth, 260, maxWidth)
```

If the viewport cannot satisfy both minimums, desktop layout must retain its
existing responsive fallback; do not permit negative/invalid widths. The
search form uses a full-width input and a separate action row. Existing
database-specific accessible labels and `aria-owns` relationship remain.

If the separator is interactive, it exposes current/minimum/maximum values and
keyboard ArrowLeft/ArrowRight changes using a documented fixed increment. The
same clamping function is shared by pointer, keyboard, hydration, and resize
paths so persisted values cannot bypass the layout constraint.

### Fixture readiness

Add a harness-level safe readiness function. It checks backend health, a
governed ready target action field, and one schema-access readiness endpoint.
It returns structured status only; it never logs authentication material,
response values, or target connection data. Query Workbench specs call it once
per relevant suite. A failure throws a fixed fixture setup error before test
steps begin.

## Test Design

### Backend

- Unit: empty scanner result has non-nil rows and marshals as `[]`.
- Integration: governed zero-row Run returns `rows: []`, `rowCount: 0`, and no
  raw error; related-record zero results use the same invariant where possible.
- Regression: removing the empty-slice initialization makes the JSON assertion
  fail.

### Frontend component/service

- Mixed-version `rows: null` with zero count renders safely.
- Inconsistent `rows: null` with positive count reaches controlled error,
  never a React error boundary.
- SSR defaults do not inspect storage in render; post-hydration restore keeps
  a saved pane open and saved valid width.
- Canonical active-database state does not request a redundant replace.
- Pointer and keyboard resize use the same bounds and persist only a valid
  width.
- EN/ZH search controls remain reachable and associated with the database.

### Real E2E

- Seed localStorage before navigation; collect browser console messages and
  fail if hydration recovery appears.
- Execute a fixture query returning zero rows; assert empty result behavior and
  absence of page/runtime errors.
- Open Objects at a wide desktop viewport, drag/keyboard resize beyond 280px,
  verify editor remains visible, reload, and verify the clamped persisted width.
- At the minimum pane width, verify a visible usable search input and localized
  controls; verify mobile still uses the bottom Sheet.
- Observe an idle query page and one explicit database transition; fail on
  duplicate navigation/request behavior.
- Exercise fixture readiness success and an isolated harness failure path.

No new test may use `test.skip`, `test.fixme`, retry configuration, route mock,
`page.evaluate`, `document.querySelector`, `HTMLElement.click()`, `force:true`,
or fixed sleeps.

## Delivery Sequence

1. Run baseline reproduction and write no code if a stated symptom is absent.
2. Implement backend array invariant and prove it independently.
3. Implement frontend response containment and hydration/URL fixes.
4. Implement pane layout/accessibility changes and focused tests.
5. Add safe fixture readiness probe and real E2E.
6. Run Momus against an on-disk `.omo/plans/*.md` execution plan using its
   absolute path as sole prompt. Run Oracle before implementation and again
   after P1/P2 fixes. Both are read-only reviewers.
7. Run final gates on exact candidate heads, then merged roots. The three
   merged-root E2E runs must each be zero fail/zero skip.

## Non-goals and Review Traps

- Do not solve route churn by disabling URL state or removing database
  selection.
- Do not solve hydration by suppressing warnings.
- Do not solve `rows:null` merely with a local optional-chain around
  `rows.length`.
- Do not solve fixture drift by increasing default test timeouts or accepting
  retries.
- Do not turn the Objects pane into a global persistent layout system.
- Do not merge the broad `wip/query-runtime-fixes-2026-07-20` branch; it
  contains reversions/deletions of shipped Query Workbench features.

## Completion Gate

The design is accepted only after the implementation meets every Phase 38P
specification acceptance criterion, Momus and Oracle report no P1/P2 findings,
and candidate plus merged-root verification evidence is recorded from exact
final SHAs.
