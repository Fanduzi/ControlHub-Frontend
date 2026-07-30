# Phase 38S: Governed Query Result Paging — Design

> Companion spec: `docs/superpowers/specs/2026-07-30-phase-38s-governed-query-result-paging.md`

## Architecture

```text
QueryEditorShell
  |  POST /query-targets/{id}/execute { statement, maxRows, pagination }
  v
QueryExecutionService
  |-- target access
  |-- QueryGuard.GuardPaginatedSelect
  |-- disclosure preflight and application
  |-- executor.Query
  |-- query execution history and audit
  v
QueryExecuteResponse { rows, columns, pagination? }
```

`QueryGuard.GuardPaginatedSelect` is the only layer that constructs the page
window. It parses one SELECT, applies the existing forbidden-node checks, and
sets the AST-owned `LIMIT pageSize + 1` plus calculated `OFFSET`. The extra row
allows the service to derive `hasNextPage` without a count query.

## Backend State and Boundaries

`QueryExecutePaginationRequest` carries a 1-based page and a finite page-size
allowlist. `ValidatePagination` checks input shape and arithmetic overflow at
the handler boundary. `GuardPaginatedSelect` then clamps the requested max
rows through the guard default and the absolute `HardMaxRows` cap, and its
pagination window rejects any offset at or beyond the effective cap and
truncates the final page so paging never releases more rows in total than the
cap allows. The response `pageSize` reports that effective window.

The execution service preserves the normal chain for every valid page. A
metadata statement returns the existing non-paginated response. Page metadata
is attached only for a successful paginated bare SELECT, so the UI never infers
pageability from result rows or statement text.

## Frontend State Model

```text
worksheet
  statement, maxRows, pageSize
  currentPage, resultPagination
  requestId, isExecuting
  result, error

browser local storage
  controlhub.query.result-page-size
  controlhub.query.max-rows
```

`QueryEditorShell` owns worksheet state. Run, Previous, Next, and page-size
change each create a new request id and call the same governed execute service.
The response may update a worksheet only when its request id still matches.
Changing max rows also rotates the request id, so a response produced under
the previous max rows is discarded rather than rendered under the new setting.
Page size is worksheet-scoped: each worksheet keeps its own selection, and new
worksheets seed from the stored preference. Max rows defaults to `100`.

`replaceActiveStatement` is the central statement-change path used by editing
and saved-statement loading. It keeps existing result/history data inert, but
invalidates a pending execution, explain state, preview provenance, related
records, and page boundary. This prevents a late old response from being shown
as the result of a loaded or edited statement.

The page-size preference is local UI convenience only. It does not influence
target credentials, active database, disclosure state, server defaults, query
history, or audit content.

## Object Search and Definition Rendering

`QueryObjectTree` forwards input immediately to `QueryObjectExplorer`.
`QueryObjectExplorer` owns one timer and one AbortController/generation per
database listing. A replacement query cancels the previous timer/request;
responses update only their current target, database, query, page, and
generation. Clear calls the same replacement path with an empty query.

`QueryObjectInspector` renders definition text through read-only CodeMirror
with the SQL language extension. It neither sends the definition to the query
executor nor permits editing.

## Accessibility and Localization

- Page controls use localized visible text and accessible names, and disable
  while requests are pending or server page metadata has no adjacent page.
- The page-size control exposes only the backend allowlist.
- Object search has a database-specific accessible name; the clear icon has a
  matching database-specific accessible name.
- `en.json` and `zh-CN.json` retain identical pagination key sets. A parity
  unit test protects the four paging labels and the `{page}` placeholder.

## Verification Strategy

1. Unit tests cover request shapes, page-state resets, stale response
   rejection, search debounce/clear, DDL read-only highlighting, and locale
   parity.
2. Backend tests and real-MySQL integration cover AST page windows, caps,
   disclosure changes between pages, and independent history/audit records.
3. Real Chromium E2E covers desktop EN, 375px EN, and desktop zh-CN. It uses
   real server traffic, no route mocks or forced interactions, and must report
   zero failures/skips in three consecutive runs on the exact candidate heads.
