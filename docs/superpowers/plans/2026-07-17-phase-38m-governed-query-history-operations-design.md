# Phase 38M: Governed Query History Operations Design

## Architecture

Phase 38M extends one existing history route rather than creating an audit
parallel surface. The backend owns filter validation, actor scope, pagination,
and controlled errors. The frontend owns worksheet-local filter, continuation,
and detail presentation state.

```text
History panel -> GET executions(status, from, to, page, pageSize)
             -> handler -> ListHistory(actor, role, target, query)
             -> repository parameterized WHERE + newest-first ordering
```

## Backend Contract

The list query gains optional typed status, `from`, and `to` fields. The handler
strictly parses known statuses and RFC3339 timestamps; invalid values produce a
controlled validation error. The service resolves target existence and actor
scope first, then invokes the repository with both scope and filters. Admin
versus non-admin visibility never becomes a browser parameter.

The repository uses bound values for all filters and returns the existing safe
record projection. Establish the actual query plan with realistic fixture rows
before adding a migration. If an index is required, keep it narrow and justify
it with the target/actor/status/time predicates used by the final query.

## Frontend State

Each worksheet stores:

```text
filters: status | from | to
history pageInfo + items
replace status/error
append status/error
detail record id or null
generation
```

Page-one replacement is used for initial load, filter apply/clear, retry, and
post-Run refresh. Append uses the next returned page and preserves current rows
on error. All asynchronous writes require worksheet, target, filters, page,
mode, and generation identity to match.

## Responsive Detail

Desktop may use a compact expandable detail row if it preserves table reading;
mobile uses the established local Sheet pattern. The component receives an
existing record and performs no new API request. Closing, retargeting, filter
replacement, or worksheet closure clears the detail selection and restores
focus to the originating row/action when it remains mounted.

## Rejected Alternatives

- Browser-side filtering: only sees loaded rows and can bypass a meaningful
  server pagination/filter contract.
- Statement-preview full-text search: preview text may contain literals and
  makes disclosure/search ergonomics broader than the approved audit surface.
- Actor selector in the browser: duplicates server authorization and invites
  scope mistakes; actor visibility remains role-derived.
- New per-record endpoint: the current record projection already contains the
  approved detail fields.
- Retention/delete controls: operational policy, not a Workbench UI feature.

## Verification Shape

Backend: model/service/handler/repository tests, integration for actor scope +
filters + pagination, OpenAPI validation, fuzz, vet, and build.

Frontend: component races for filters/page replacement/append/detail closure,
EN/ZH accessibility tests, and real E2E creating enough governed executions to
exercise page two, filters, and mobile detail. All final commands run on the
exact final commits with zero failed and zero skipped E2E tests.
