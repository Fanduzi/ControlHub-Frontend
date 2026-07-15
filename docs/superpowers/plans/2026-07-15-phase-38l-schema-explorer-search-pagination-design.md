# Phase 38L Delivery A: Schema Explorer Search And Pagination Design

## Decision

Extend the visible `QueryObjectExplorer` rather than adding another global
navigator. The project already has a Quick Navigator; this work makes the
Objects pane/Sheet itself reliable for schemas larger than its initial page.

`QueryObjectExplorer` owns listing data, request identity, cancellation, and
interaction callbacks. `QueryObjectTree` remains a presentational tree with
explicit controls. The existing `QuerySchemaStore` continues to cache only
object details and is not repurposed as a list/search cache.

## Listing Model

The Explorer holds two bounded listing layers:

```text
Database listing
  items + pageInfo + loading/error + generation

Object listing, keyed by database
  submitted query + items + pageInfo + loading/error + generation
```

Each listing stores only the pages the operator explicitly loaded. On a Load
more response, append in server order and deduplicate database names or object
`kind:name` identities. Do not sort client-side and do not request a larger
page as a substitute for pagination.

## Search Model

An expanded database has input text and a submitted normalized query. Typing is
local only. Pressing Enter or the explicit Search button trims input and starts
one page-1 request with `q` when nonempty. Clear resets both input and submitted
query and explicitly loads unfiltered page 1.

This avoids unbounded request-on-keystroke behavior while ensuring search
crosses all backend pages rather than filtering page-one client data.

## Request Identity

Every listing request captures:

```text
targetId + Explorer generation + database + submittedQuery + page + listingGeneration
```

Starting another search for the same database aborts its previous controller,
increments that listing generation, and replaces page-one state. Load more is
disabled while pending. Target change aborts all active controllers and clears
all listing, object-expansion, detail, and Inspector state.

Before writing an object listing completion, verify the captured identity still
matches state. This protects against an old query, a target switch, rapid
Search/Clear interactions, an old page-two response, and component unmount.

## Existing Object Feature Boundaries

If a changed search removes the currently expanded object, collapse its detail
and close any Inspector for that database before rendering replacement results.
For objects that remain visible, current detail, Inspector, View definition,
Preview rows, and FK behavior must not be rewritten. Search and pagination do
not fetch details or definitions automatically.

## UI Shape

Within an expanded database group, render a small labeled form before table/view
groups. Follow it with the existing object tree, a local empty/error/retry
message if appropriate, and Load more objects when `hasNextPage`. At the root
tree footer render Load more databases only when root `hasNextPage`.

Use existing `Button`, semantic Tailwind tokens, and `queryWorkbench.schema`
i18n keys. Keep controls outside treeitems, with concise labels that fit the
mobile bottom Sheet. No shared Dialog/Sheet changes are allowed.

## Rejected Alternatives

- Client-side filtering: it cannot find objects past loaded pages.
- Eagerly fetching all pages: violates bounded schema exploration and causes
  avoidable load on large targets.
- Extending the Quick Navigator instead: duplicates its global keyboard surface
  while leaving the primary Objects UI incomplete.
- Page jump/page-size controls: add complexity without a demonstrated need;
  incremental continuation matches the bounded loading model.
- Fixture mocks for page two: would not prove the governed endpoint works with
  a large real schema.
