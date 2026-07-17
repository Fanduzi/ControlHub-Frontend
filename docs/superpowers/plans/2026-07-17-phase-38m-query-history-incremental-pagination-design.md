# Phase 38M: Query History Incremental Pagination Design

## Decision

Extend the existing per-worksheet History state machine in
`QueryEditorShell`. The backend and frontend service already support bounded
history pagination, so this delivery retains the API contract and adds only a
local continuation state plus a small History-panel action.

## Current State

`listQueryExecutions(targetId, { page, pageSize })` already serializes page
parameters and returns `QueryExecutionListResponse` with `items` and
`pageInfo`. `refreshHistory` currently requests the default first page and
discards pageInfo. `QueryHistoryPanel` renders the records but has no
continuation or append-error surface.

## History Model

Each `LocalWorksheet.history` retains:

```text
items
pageInfo
status: idle | loading | ready | error
appendStatus: idle | loading | error
appendError
boundTargetId
generation
```

`status` governs first-page replacement. `appendStatus` governs only a pending
or failed next page, so a continuation failure never hides page-one records.
Use a pure append helper that deduplicates execution ids and preserves response
order. Do not client-sort or refetch a larger page.

## Request Modes

`replace` always requests page 1/pageSize 20 and replaces `items` plus
`pageInfo`. First History open, a page-one retry, and post-Run refresh use this
mode. A successful Run deliberately discards older loaded pages.

`append` reads `pageInfo.page + 1`, keeps existing items visible, and only
updates the same worksheet when worksheet id, target id, generation, page, and
mode still match. On failure, retain items/pageInfo and expose a retry for the
same next page.

## Invalidations

Retarget, target-switch worksheet creation, worksheet close, unmount, and a
newer replace all increment/invalidate history generation. Existing guards for
worksheet target ownership remain mandatory. History must never reuse execute
`requestId` as its only guard.

## UI

Keep the existing table and safe metadata columns. Beneath it, render one
localized Button only when `hasNextPage`. Disable it while append is loading.
Render a scoped append error and Retry without replacing table rows. Add concise
EN/ZH labels with no raw server error text.

## Tests

Use existing `query-workbench.test.tsx` deferred-promise race patterns. Add
tests for append order/dedupe, page parameters, append retry preservation,
post-Run replacement, target/worksheet stale rejection, and continuation
visibility/disabled state. Add real E2E that creates enough executions through
the governed Run path and verifies page two in EN desktop, EN mobile, and ZH
desktop without mocks or skips.

## Boundaries

Do not change the backend contract, actor scope, service type, history search,
page-size selection, persistence, exports, credentials, SQL guard, or result
grid. If real E2E cannot safely produce more than one accessible history page,
stop and define a fixture prerequisite rather than weakening acceptance.
