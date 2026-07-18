# Phase 38M: Query History Incremental Pagination Design

## Decision

Extend the existing per-worksheet History state machine in
`QueryEditorShell`. Cursor continuation remains worksheet-local, while the
backend handler owns the precise page/pageSize contract and controlled errors:
absent page means cursor-initial, valid explicit page means offset/pageInfo,
and explicit invalid page/pageSize returns 400 without a service call.

## Current State

`listQueryExecutions(targetId, { page, pageSize, cursor })` serializes the
pagination mode and returns `items`, `nextCursor`, and optional `pageInfo`.
`refreshHistory` requests the cursor-initial page and resets continuation.
`QueryHistoryPanel` renders the records and the cursor continuation action.

## History Model

Each `LocalWorksheet.history` retains:

```text
items
nextCursor
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

`replace` requests the cursor-initial page at pageSize 20 and replaces `items`
plus `nextCursor`. First History open, a page-one retry, and post-Run refresh
use this mode. A successful Run deliberately discards older loaded pages.

`append` sends the current `nextCursor`, keeps existing items visible, and only
updates the same worksheet when worksheet id, target id, generation, cursor,
and mode still match. On failure, retain items/nextCursor and expose a retry for
the same continuation.

## Invalidations

Retarget, target-switch worksheet creation, worksheet close, unmount, and a
newer replace all increment/invalidate history generation. Existing guards for
worksheet target ownership remain mandatory. History must never reuse execute
`requestId` as its only guard.

## UI

Keep the existing table and safe metadata columns. Beneath it, render one
localized Button only when `nextCursor` is present. Disable it while append is
loading.
Render a scoped append error and Retry without replacing table rows. Add concise
EN/ZH labels with no raw server error text.

## Tests

Use existing `query-workbench.test.tsx` deferred-promise race patterns. Add
tests for append order/dedupe, page parameters, append retry preservation,
post-Run replacement, target/worksheet stale rejection, and continuation
visibility/disabled state. Add real E2E that creates enough executions through
the governed Run path and verifies page two in EN desktop, EN mobile, and ZH
desktop without mocks or skips. Add handler/OpenAPI tests for invalid explicit
page/pageSize values and component tests for click/keyboard detail focus
restoration and safe row removal.

## Boundaries

Do not change actor scope, service type, history search,
page-size selection, persistence, exports, credentials, SQL guard, or result
grid. If real E2E cannot safely produce more than one accessible history page,
stop and define a fixture prerequisite rather than weakening acceptance.
