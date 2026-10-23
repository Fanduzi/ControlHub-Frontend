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
| `scripts/` | Gate-script contracts: `check-e2e-pg-fixture.test.ts` locks the mandatory pre-browser PG fixture gate (assembly 404 / wrong backendSha / foreign runId / missing or unresolved connections / unset E2E_RUN_ID all fail closed); `pg-fixture-lifecycle.test.ts` locks the fixture script safety/lifecycle contract with PATH command stunt doubles (precheck rejects remote/malformed DSNs and dirty worktrees with zero docker/mysql calls, exclusive per-run state, create→register→start ordering, converged failure cleanup, foreign-PID refusal, NotFound-only classified container errors incl. daemon/permission/timeout/unknown inspect failures, sanitized whitelist evidence) and against real test-owned processes (a compiled sleeper binary verifies exe-identity matching through symlinked paths, TERM/KILL bounded waits, and refusal to signal foreign PIDs — orphans so init reaps them) plus the existing preflight/governance/error-code checker tests |

## Interfaces

- Vitest unit and component test suites run through `npm test`.
- Page tests assert normalized URL parameters reach server data loaders, explicit invalid Query Workbench targets remain unselected, and empty database-cluster detail panels remain visible.

## Dependencies

- Upstream: frontend components, services, and shared libraries
- Downstream: none
