# Phase 38M: Query History Incremental Pagination

## Status

Merged and verified on 2026-07-18 as 38M Workstream A. It follows Phase 38L
and consumes the governed execution-history pagination contract. The broader
38M milestone is defined in
`2026-07-17-phase-38m-governed-query-history-operations.md`.

## Delivery Evidence

- Backend main: `94c2c39cbd1615283fb06ac5d49eb9e1f2e789ee`.
- Frontend main: `639bf28017b74e75223effd1c6313ae9fae7d203`.
- Real merged-head E2E: 70 passed, 0 failed, 0 skipped.
- CI: [backend run 29638474931](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/29638474931) and [frontend run 29638474360](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/29638474360) completed successfully.

## Planning Baseline

Before Phase 38M, the execution-history endpoint returned `items` and
`pageInfo`, with a bounded default page size of 20. The Workbench requested
only page 1, stored only `items`, and offered no way to reach older accessible
records.

## User Outcome

An operator can explicitly load older execution records for the active
worksheet target. Recent records remain visible while older records append in
server order. The History panel preserves the current safe actor, duration,
status, statement-preview, and controlled-error presentation.

## Existing Contract

Use only the existing authenticated endpoint:

```text
GET /query-targets/{id}/executions?[page={page}&]pageSize={pageSize}&[cursor={cursor}]
```

The browser sends target id and pagination parameters only. It does not send an
actor id, SQL, credential reference, DSN, result values, or history filter.
The server continues to decide visibility: admins receive target history and
non-admins receive only their own rows.

When `page` is absent, the request uses cursor-initial mode; a valid explicit
`page` uses legacy offset mode and returns `pageInfo`. Explicit invalid `page`
or `pageSize` values return `400 validation_failed` and do not invoke history
listing. `pageSize` defaults to 20 and accepts only integers in `1..500`.
`page` and `cursor` are mutually exclusive.

## Functional Requirements

- First opening a worksheet History tab requests only the cursor-initial page at
  page size 20;
  it must not add a mount-time request.
- When `nextCursor` is present, show a localized, keyboard-reachable
  `Load more history` action.
- Loading more requests exactly the next opaque cursor continuation for the
  same worksheet target and appends records in the returned newest-to-oldest
  order, deduplicated by execution id.
- A successful Run refreshes the cursor-initial page and replaces all previously loaded history
  pages, because newest-first ordering may have changed.
- A page-1 error replaces the panel with the existing controlled error/retry
  state. An append error retains currently loaded records and presents an
  explicit retry for that next page.
- Loading, retry, empty, and continuation controls are scoped to the active
  worksheet. They are localized in English and Simplified Chinese and usable at
  375px without changing shared Sheet/Dialog primitives.

## State And Concurrency Requirements

History remains worksheet-local. It is not stored in a URL, local storage,
global cache, schema store, query history persistence, or another worksheet.

Each history request is identified by worksheet id, target id, history
generation, requested page, and mode (`replace` or `append`). The history
generation is independent of query execution request ids. A completion may
write only if that identity remains current.

Target switch, retarget, worksheet close, unmount, a newer page-1 refresh, and
another history action invalidate prior requests. A late page-two response must
never append into another target, another worksheet, or a newly refreshed page
one. A second continuation click is disabled while append is pending.

## Acceptance Criteria

- Component tests prove page-two request parameters, ordered append,
  id-deduplication, hidden continuation without a next page, append retry, and
  page-one replacement after Run.
- Race tests prove stale page two cannot overwrite a newer refresh, target
  switch, retarget, worksheet close, or another worksheet.
- Existing actor display and safe error rendering remain unchanged; the browser
  does not reinterpret actor visibility.
- Real E2E creates enough governed fixture executions to load history page two
  and covers desktop English, 375px mobile English, and desktop Simplified
  Chinese with zero failures and zero skips.
- Detail close by Escape and explicit Close restores focus to the originating
  row on desktop and 375px mobile; keyboard activation restores the same row;
  removing the row while detail is open closes without focusing a detached
  element.
- All final gates run against the exact final commit. Fixture insufficiency is a
  loud setup blocker, never a mock or test skip.

## Explicit Non-Goals

No migrations; no history search, filters, page jumps,
page-size selector, export, persistence, cross-target history, SQL insertion,
credential controls, actor-id exposure, result-row display, or SQL guard change.
