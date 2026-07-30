# Phase 38S: Governed Query Result Paging — Product Spec

## Status

| Field | Value |
| --- | --- |
| Phase | 38S |
| Date | 2026-07-30 |
| Priority | P1 query-workbench usability and governance gap |
| Dependencies | Phase 38Q result disclosure; existing governed query execution |
| Scope | Bounded SELECT result paging, object-search interaction, and definition presentation |

## Objective

Give operators bounded, navigable query results without creating a second query
engine or bypassing access, SQL-guard, disclosure, execution-history, or audit
enforcement. The Query Workbench must make result page size explicit, retain it
locally, and request every page through the existing governed execute endpoint.

## Locked Product Decisions

### Result paging

- `POST /query-targets/{id}/execute` accepts an optional `pagination` object
  with required `page` and `pageSize` fields.
- Pages are 1-based. Allowed page sizes are exactly `10`, `25`, `50`, and
  `100`; the worksheet default is `10`.
- The backend rejects non-positive pages, unsupported page sizes, integer
  offset overflow, and a page whose offset is at or beyond the effective row
  cap.
- `maxRows` is the total governed row-release cap for the statement, not a
  per-page value. The guard clamps the requested value through its default and
  the absolute `HardMaxRows` cap before computing any page window, so paging
  can never release more rows in total than the effective cap allows.
- `pagination` is valid only for a parser-approved bare `SELECT`. Metadata
  statements retain their existing single-response behavior and do not return
  pagination metadata.
- A paginated SELECT response contains only server-computed
  `{page, pageSize, hasPreviousPage, hasNextPage}`. The returned `pageSize` is
  the effective server-granted window, which may be smaller than the requested
  page size on the final page before the row cap. It never exposes a total
  row count, snapshot token, cursor, DSN, credential, or disclosure internals.
- A client-provided `LIMIT` or `OFFSET` never controls the result window. The
  backend AST guard owns `LIMIT pageSize + 1 OFFSET (page - 1) * pageSize`.
- Every page is a fresh governed execution: target access, SQL guard,
  disclosure preflight/application, executor, execution history, and audit all
  run independently. A changed disclosure policy applies to the next page.

### Worksheet behavior

- Run starts at page 1 using the selected page size. Previous and Next appear
  only when a SELECT response includes pagination metadata.
- Changing page size re-executes page 1. Changing statement text or max rows
  resets paging to page 1. Changing max rows also invalidates any in-flight
  Run by rotating the worksheet request id, so a response produced under the
  old max rows is never rendered under the new setting.
- The selected page size is stored only in browser local storage under
  `controlhub.query.result-page-size`; it is not persisted to the backend or
  query history. The page size is worksheet-scoped state: each worksheet keeps
  its own selection, and new worksheets seed from the stored preference.
- Max rows defaults to `100` and is stored only in browser local storage under
  `controlhub.query.max-rows`, mirroring the page-size preference.
- Paging controls are disabled while a request is in flight. The frontend must
  not slice, cache, or fabricate result pages client-side.
- Replacing a worksheet statement, including loading a saved statement,
  invalidates any pending Run response. A late response must not write results
  for the old statement into the replacement statement.

### Objects and definitions

- Object-name search is server-side and scoped to one expanded database.
- Typing uses exactly one 250ms debounce owned by `QueryObjectExplorer`; there
  is no Search submit button and no second debounce in `QueryObjectTree`.
- The clear icon immediately resets the search and restores the unfiltered
  server listing. Search never filters only already loaded rows.
- View definition displays server-provided DDL in a read-only SQL CodeMirror
  surface with syntax highlighting. It never executes the DDL.

### Localization and responsive behavior

- English and Simplified Chinese must provide all pagination labels:
  `previousPage`, `nextPage`, `page`, and `pageSize`.
- Missing translation keys are release blockers because they emit console
  errors and expose raw message identifiers.
- Desktop and 375px mobile layouts expose usable, non-overlapping pagination
  controls. Previous/Next disabled states reflect server metadata.

## API Contract

Request addition:

```json
{
  "statement": "SELECT id FROM orders",
  "maxRows": 100,
  "pagination": { "page": 1, "pageSize": 25 }
}
```

Response addition for a paginated bare SELECT:

```json
{
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "hasPreviousPage": false,
    "hasNextPage": true
  }
}
```

`pagination` is absent for metadata responses and for callers that do not ask
for a page boundary.

## Non-Goals

- No cursor API, arbitrary page-size input, arbitrary page jumps, total-count
  query, result snapshot persistence, export, or new query engine.
- No browser SQL parsing, client-side result slicing, relaxed SQL guard, or
  disclosure-policy bypass.
- No query execution while opening an object definition, searching objects, or
  loading a saved statement.

## Acceptance Matrix

| # | Criterion | Required proof |
| --- | --- | --- |
| 1 | Request validation accepts only the bounded paging contract | Model, handler, OpenAPI tests |
| 2 | Guard owns page window and ignores user LIMIT/OFFSET | Guard and real-MySQL integration tests |
| 3 | Every page follows governed access/disclosure/history/audit chain | Service and integration tests |
| 4 | Desktop page navigation and page-size persistence work | Real Chromium E2E traffic and screenshots |
| 5 | 375px controls remain usable with correct boundaries | Real Chromium mobile E2E |
| 6 | Object search sends one debounced server request and clear restores rows | Unit and EN/zh-CN E2E |
| 7 | DDL is read-only syntax-highlighted SQL | Component test and browser evidence |
| 8 | Saved-statement replacement rejects a late old Run response | Regression test and real-browser scenario |
| 9 | EN/zh-CN pagination keys are complete and no console i18n errors occur | Message parity test and zh-CN E2E |
| 10 | Exact candidate has zero failed and zero skipped E2E tests in three consecutive runs | E2E totals and runtime provenance |
