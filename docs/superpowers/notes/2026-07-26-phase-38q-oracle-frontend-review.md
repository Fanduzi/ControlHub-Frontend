# Phase 38Q Oracle Frontend Adversarial Diff Review

## Metadata
- Reviewer: Oracle
- Scope: `7a7f6fb...ae3734b` (frontend)
- Timestamp: 2026-07-26T03:19:28Z
- Result: **P1=2, P2=1 — Merge blocked**

## Findings

### P1: Result rendering does not fail closed on disclosure-contract violations
`normalizeExecuteResponse` (components/query/query-editor-shell.tsx:1699) validates only column names, row presence, and row count. It does not validate `displayMode`, `copyAllowed`, a row's width, or that a `masked_no_copy` value is actually the server-produced mask. `ResultTable` (components/query/query-editor-shell.tsx:2362) then renders every received cell through `ResultCell` (components/query/query-editor-shell.tsx:2397), independent of its column's disclosure decision.

A response such as `{ displayMode: "masked_no_copy", copyAllowed: false, rows: [["raw-password"]] }`, an omitted decision field, or a `blocked` column with rows would display the raw value.

**Fix required**: Reject successful responses unless every column has a recognized, internally consistent decision, no column is `blocked`, each row has exactly `columns.length` cells, and each non-null `masked_no_copy` cell equals the server mask sentinel. Render a generic controlled error for any violation, never the suspect rows.

### P1: Disclosure-policy management UI is unreachable
`QueryDisclosureEntry` (components/settings/query-disclosure-entry.tsx:33) links admins to `/settings/query-disclosure-policies`, but the app contains only `app/(console)/settings/page.tsx` under settings. There is no matching App Router page, and `middleware.ts` and `next.config.ts` do not rewrite the path.

**Fix required**: Add `app/(console)/settings/query-disclosure-policies/page.tsx`, load the permitted query targets there, render `QueryDisclosureSettings`, and add a route-level/E2E test.

### P2: Query disclosure errors still render raw server error text
`toQueryExecuteError` (services/query-executions.ts:83) retains `ApiError.message`, and `ExecuteErrorPanel` (components/query/query-editor-shell.tsx:2423) renders it verbatim. The new `disclosure_blocked` mapping therefore relies entirely on the backend always producing a fixed safe message.

**Fix required**: For `query_result_disclosure_blocked`, render only the localized error-code message. Prefer the same approach for all query-execution errors, with any displayed details explicitly allowlisted.

## Positive Findings (no P1/P2)

- **Test stability**: The `findAllByText` substitutions in `query-relationship-map.test.tsx` correctly wait for the async labels while preserving the relevant EN/ZH label assertions. The removed back-button presence check is already covered by the dedicated preceding test, so this change does not weaken the label behavior under test.
