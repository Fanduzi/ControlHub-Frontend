# Phase 38M: Governed Query History Operations

## Status

Planned. Phase 38M makes the existing Query Workbench History panel useful for
operational investigation at scale without expanding query execution, actor
visibility, or data disclosure.

## Milestone Goal

An operator can browse older execution metadata, narrow the timeline by safe
operational criteria, and inspect a single history record on desktop or mobile.
Every result remains governed by the existing authenticated history endpoint:
admins see target records and non-admins see only their own records.

## Included Workstreams

### A. Bounded Continuation

Use the current page/pageSize/pageInfo contract to append older rows for the
active worksheet. A Run or filter change refreshes page one and invalidates
older loaded pages.

### B. Server-Governed Operational Filters

Extend the existing endpoint with a validated execution status and RFC3339 time
window. Actor scope is composed server-side before filtering. The browser sends
no actor id, SQL, preview text, credential, or result value. Full-text SQL
search is explicitly excluded because statement previews can contain literals.

### C. Responsive Safe Record Detail

Use the existing history-record fields in a local, read-only detail surface for
narrow screens and dense audit reading. It may show actor display name, engine,
status, timestamp, statement preview/digest, rows, duration, and controlled
error metadata only. It must not offer editor insertion, copy/export/download,
raw results, credentials, or raw backend errors.

## Safety Boundary

- Existing backend actor visibility remains authoritative.
- History remains metadata-only and never exposes raw actor IDs, emails, DSNs,
  passwords, result rows, or raw driver errors.
- All list/filter/pagination queries remain bounded and parameterized.
- The browser stores state only in the active worksheet; no URL, local storage,
  global cache, persistence, or cross-target aggregation is introduced.
- No retention/deletion policy, approval workflow, saved query, query guard
  change, or credential-management work is included.

## Completion Standard

The milestone is complete only when backend contract/integration/OpenAPI/fuzz
coverage and frontend component/E2E coverage prove pagination, filters, actor
scope, stale-request rejection, mobile detail, EN/ZH behavior, and zero-skip
real E2E against a fixture with more than one accessible history page.
