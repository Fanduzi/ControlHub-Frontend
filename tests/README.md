# Frontend tests

Frontend Vitest and route-level contract tests.

List-page coverage verifies normalized pagination, server search, audit environment
scope, bulk-mutation dictionary flow, settings taxonomy flow, and fail-closed behavior for unknown environment scopes.

Topology tests cover graph rendering for isolated nodes, database cluster-group
labels, explicit URL scopes, provider fallback, root selection/clearing, stale
responses, and fail-closed scopes.

## Members

| Directory/file | Responsibility |
|---|---|
| `components/` | React component behavior, including URL-owned audit search and result-contract badges/copy/CSV gating |
| `services/` | API service serialization, `cellTruncated` capability declaration, and controlled-error behavior |
| `lib/` | Shared list URL parsing, result-envelope matrix validation, CSV whole-page eligibility refusal (missing/extra cells, non-boolean matrix, truncated/disclosure-blocked cells), and worksheet-session state contracts |
| `use-debounce.test.ts` | Shared callback debounce timing and unmount cancellation |
| `e2e-api-proxy-cancel.test.ts` | Socket-level downstream-close → upstream-abort cancel propagation for the disposable E2E api proxy, including the `/__cancel-forwarding` negative control |
| `pages.list-pagination.test.tsx` | Verifies list-page parameter normalization, server search/pagination requests, persisted audit environment scope, settings dictionaries, and table data flow. |
| `pages.query.test.tsx` | Verifies Query Workbench/disclosure All-environment loading, URL scope, and fail-closed explicit environment/target selection. |
| `topology-page.test.tsx` | Verifies server resolution of canonical topology environment/root URL state. |

## Interfaces

- Vitest unit and component test suites run through `npm test`.
- Page tests assert normalized URL parameters reach server data loaders, explicit invalid Query Workbench targets remain unselected, and empty database-cluster detail panels remain visible.

## Dependencies

- Upstream: frontend components, services, and shared libraries
- Downstream: none
