# Phase 38L Delivery A: Schema Explorer Search And Pagination

## Status

In progress. Implementation complete; E2E blocked by pre-existing connection
dialog timing issue (fails on baseline `ea6062a` too).

## Problem

The current Objects browser fetches database page 1 and, after a database is
expanded, object page 1 with a fixed page size of 25. It renders only the
returned items and discards `pageInfo`. Consequently, an operator cannot reach
the 26th table/view in a database, even though the governed API already exposes
bounded pages and server-side object-name search.

## User Outcome

An operator can explore large schemas without unbounded preloads:

- load additional database pages only when needed;
- expand a database and search its table/view names through the server;
- load additional object pages for the active search or unfiltered listing;
- retain existing object details, Inspector, table definition, Preview rows,
  and FK navigation behavior for objects reached after page one.

## Existing API Contract

No endpoint or OpenAPI change is allowed. The frontend uses only:

```text
GET /query-targets/{id}/schema/databases?page={page}&pageSize=25
GET /query-targets/{id}/schema/objects?database={database}&q={query}&page={page}&pageSize=25
```

`ObjectListResponse` and `DatabaseListResponse` already contain `items` and
`pageInfo`. Browser requests contain only the target id and documented query
parameters. They must not contain SQL, DSNs, credentials, actor ids, result
values, or browser-constructed database commands.

## Functional Requirements

- Keep the first database request bounded to `page=1&pageSize=25`.
- Render an accessible localized `Load more databases` action only when the
  database response has `pageInfo.hasNextPage`.
- Expand a database lazily and request object page 1 with `pageSize=25`.
- Each expanded database exposes a localized object-name search field, explicit
  Search action, and Clear action. Search must make a governed server request
  using `q`; filtering only already loaded client rows is forbidden.
- Submitting a changed query replaces the database listing with page 1. Clearing
  and submitting restores the unfiltered page-1 listing.
- Render `Load more objects` only when the active listing has a next page. It
  appends the next page in server order and deduplicates object identity by
  `(kind, name)`.
- Loading, empty, error, and retry states must be localized and scoped to the
  affected database/listing. A failure in one database cannot erase another.
- Existing desktop Objects pane, mobile Objects Sheet, English, Simplified
  Chinese, dark theme, Inspector, Preview rows, definition, and FK flows remain
  intact.

## State And Concurrency Requirements

Listing state is local to `QueryObjectExplorer`, never a worksheet, URL, local
storage, history, global schema cache, or persistence layer. Each root database
page and per-database object listing has an AbortController plus monotonically
increasing generation.

A response may update state only when its target, database, normalized submitted
query, requested page/mode, and generation still match the current listing.
Target changes, changed searches, object-list replacement, Inspector closure
caused by filtering, and component unmount must abort or invalidate relevant
requests. A late page-two or old-query response must never appear under another
target or query.

## Accessibility

Tree controls remain outside `treeitem` roles. Search uses a visible label or
accessible name that identifies its database; Search, Clear, Load more, Retry,
and loading states are keyboard reachable and localized. At 375px controls must
remain usable inside the bottom Sheet without modifying shared Sheet primitives.

## Real E2E Prerequisite

The dedicated real MySQL fixture must contain at least 26 visible objects in
one accessible database before this delivery can claim real E2E coverage of
object page two. The currently known fixture has only a small set of schema
objects and does not prove this path.

If controlled fixture expansion requires backend work, that prerequisite must
be specified and delivered separately before frontend completion. Do not use
Playwright route mocks, test skips, injected page-evaluation clicks, or
client-only filtering to claim page-two acceptance.

## Acceptance Criteria

- Component coverage proves object and database page-two requests, append order,
  deduplication, explicit server search, clear/reset, per-listing retry, and
  stale response rejection.
- A table reached through a later object page retains Inspect and Preview rows;
  search/pagination alone makes no execute, related-record, or definition
  request.
- Real E2E covers desktop English, 375px mobile English, and desktop Simplified
  Chinese search behavior against a healthy compatible backend.
- When a 26-plus object fixture is available, real E2E proves page-two loading;
  otherwise the delivery remains blocked rather than reported complete.
- Final verification on the exact final HEAD has zero test failures and zero
  skips.

## Explicit Non-Goals

No global search replacement, cross-database search, database-name search,
arbitrary page jumps, page-size selector, backend/OpenAPI/migration changes,
fixture mutation inside the frontend task, SQL generation, DDL execution,
result-grid changes, history pagination, export/copy, credentials, or new
persistence are included.
