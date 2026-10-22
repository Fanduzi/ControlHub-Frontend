# e2e

Playwright end-to-end tests running against real Chromium with a live backend.

## Specs

| Spec | Coverage |
|------|----------|
| operator-session.spec.ts | Console BFF boundary (38X-1C/38X-1D): BFF login seals HttpOnly Operator Session cookie; proxy forwards server-held credential; client Authorization and unsafe Origin rejected; logout (API + real UI) and forged/tampered/expired page gate; fail-closed UI sign-out under network failure; legacy controlhub.token alone rejected; desktop EN / 375px EN / desktop zh-CN coverage; no browser-readable bearer or role state |
| query-result-contract.spec.ts | T8 result contract consumption (T13-A + R1-1): `cellTruncated` capability declared on execute / saved-statement execute / related-records request bodies (real POST body capture), real backend matrices render per-cell truncated badges + page notice, truncated-cell copy blocked while clean cells stay copyable, clean-page CSV download parsed field-by-field (commas/quotes/CR/LF, NULL vs empty vs text "NULL", exact 8192-boundary), masked/blocked/truncated pages fail the whole-page export gate (zero download, `[masked]`/`[blocked]` placeholders are never serialized), unpolicied-column 403 stays blocked, clean page re-enables export, 409 `result_contract_upgrade_required` shows controlled copy with no retry and no stale result, malformed-matrix fault injection fails closed, cross-worksheet result isolation (desktop EN) |
| query-workbench.spec.ts | Query workbench shell with per-test admin-workspace isolation (reset retries `query_workspace_conflict`), idempotent current-target selection, and deterministic ready/locked fixture selection across All environments, schema explorer, FK navigation, object inspector, paging, saved statements, guaranteed Saved Statement teardown (`afterEach`; DELETE 404 is success), terminal delete 404-absence (desktop EN / 375px EN / desktop zh-CN), 375 search-on-own-row and no overflow, explain, relationship map, shared-template affordance, shared template execution, disposal, schema metadata identity isolation (one database-list request per load generation, reuse on database selection, null-default behavior, 375/zh-CN no-overflow), 375/zh-CN session, no-leakage assertions, list pagination |
| query-workbench-pg.spec.ts | PostgreSQL governed workbench against the disposable PG fixture (target `local-pg-query-dev`, connections `labdb`/`labdb_other`): composite connection + schema pin selectors, ad hoc keyed execution, write/multi-statement controlled 403s, disclosure mask/block + cellTruncated + whole-page CSV gating with RFC-4180 field-level verification, cancel propagated browser → BFF → proxy → backend gated on a real pg_stat_activity active barrier (run-marked statement, bound-parameter monitor via the fixture container's psql, backend pid + backend_start pinned) and proven by the same clientExecutionId reading back `cancelled`+`stopped` plus post-cancel pid death, plus a `/__cancel-forwarding` negative control asserting strict `timeout`/`query_timeout` convergence, database-scoped history union, saved statement list/create scoped by `database`, related-records FK navigation with duplicate-gesture single-POST dedup, workspace reload restoring `activeDatabase`/`activeSchema`, governed page-number paging fields, dollar-quoted/cast/comment statement boundaries, keyed-attempt dedup + re-keying, a labeled contract-upgrade fault injection, restored-missing-connection reselection, and unlisted-database refusal |
| console-ux.spec.ts | Console layout and UX checks |
| databases-sheet.spec.ts | Databases sheet interactions |
| list-pagination.spec.ts | List pagination behavior |
| login.spec.ts | Login flow |
| operator-console-smoke.spec.ts | Operator console smoke tests |
| operator-database-workflow.spec.ts | Operator database workflow, including fresh observed-health setup for the healthy compact deck |
| operator-interaction-stability.spec.ts | Operator interaction stability |
| query-credential-settings.spec.ts | Query credential settings (BFF-session-backed admin flows with no readable browser role state); composite PostgreSQL targets render one row per enumerated connection and every credential request carries the `?database=` selector |
| resource-archive.spec.ts | Resource archiving |
| resources-sheet.spec.ts | Resources sheet |
| settings.spec.ts | Settings page |
| topology.spec.ts | Topology view |

## Helpers

| File | Purpose |
|------|---------|
| harness/backend-health.ts | Backend health check |
| harness/auth.ts | UI login helper (provisioned fixture identities) |
| harness/fixtures.ts | Fail-loud fixture credential resolver (no seed fallback) |
| harness/console-guards.ts | Console/network error guards, including one-shot expected errors and optional consume for logout-race 401s |
| harness/dev-server-wrapper.sh | Dev server wrapper for E2E |
| harness/interaction-stability.ts | Interaction stability helpers |
| harness/workbench.ts | Shared workbench helpers: `openQueryWorkbench`, CodeMirror editor access, ready-target selection |
| harness/result-contract-fixture.ts | T13-A fixture seeder: `docker exec` idempotent seed of `t13_*` boundary-cell/FK tables into the disposable Query E2E MySQL (password read from the backend fixture state file, never printed) + disclosure policies via the real admin API |
| harness/saved-statement-teardown.ts | Query Workbench Saved Statement teardown: record create ids, `afterEach` DELETE (404 is success; any other failure fails the test) |
| api.helpers.ts | Authenticated API helpers; defaultResourceInput supplies typed-profile minimum identity |
| api-proxy.mjs | API proxy for same-origin E2E requests. Forwards real traffic plus controlled CORS; no permission rewriting — every capability flag reaches the browser exactly as the fixture backend emits it (R1 removed the former export=true injection; the fixture backend grants the CSV affordance itself from resolver-verified credentials). Forwards downstream-cancel → upstream-abort across the whole fetch exchange (a close after response end is teardown, never a cancel); test-only `/__cancel-forwarding` negative control disables that forwarding for the cancel-propagation spec; `/__health` run identity for the spec's fixture check; `/__recorded-requests` sanitized per-path OCC metadata (no bodies/SQL/credentials) |
| backend-fixture.env | Single reviewed pin of the backend companion object (`CONTROLHUB_BACKEND_SHA` + `CONTROLHUB_BACKEND_TREE`). Both CI jobs, the fixture launcher, the pre-browser gate, and the PG spec's assembly check all read this one file — never a moving branch. Bump only by reviewed change. |
| pg-fixture-seed.sql | Deterministic disposable-PostgreSQL seed applied by `scripts/e2e/pg-fixture-up.sh`: `labdb`/`labdb_other` databases, SELECT-only `ro_user` (per-run password via psql variable, never stored), `e2e`/`e2e_alt` schemas, items/parent/child(FK)/paging/alt/only_in_other objects and rows, and grants — identical to the verified local fixture. |

## PG fixture lifecycle (mandatory for the full suite)

`scripts/e2e/pg-fixture-up.sh` cold-starts the entire verified combination on a
clean machine: verifies the backend checkout `HEAD`/`tree` against
`backend-fixture.env`, starts a disposable `postgres:17.10` container with
per-run masked passwords, applies `pg-fixture-seed.sql`, seeds the metadata
rows (target `local-pg-query-dev`, `PG_LABDB_RO`/`PG_OTHER_RO` credentials,
disclosure policies), builds `cmd/e2e-pg-server` (refuses unstamped linked-
worktree builds — `vcs.revision` must equal the pin), starts the listener with
`E2E_RUN_ID` + `CONTROLHUB_E2E_FIXTURE_MODE=1`, and asserts the `/e2e/assembly`
identity document before declaring success. `scripts/e2e/pg-fixture-down.sh`
tears down only the recorded PID + container ID.

`npm run release:e2e` first runs `scripts/check-e2e-pg-fixture.mjs`, which
fails closed (nonzero) unless the assembly document reports the pinned
`backendSha` and this run's `E2E_RUN_ID`, and resolver-verified
`labdb`/`labdb_other` connections are enumerated — a plain `cmd/server` or a
foreign/stale listener is rejected, never skipped. The PG spec's `beforeAll`
repeats the same identity assertions plus the playwright-managed proxy's
`runId`, so a missing fixture cannot silently pass.

## Saved Statement teardown

Query Workbench tests that create a Saved Statement must record `{ id, targetResourceId }` and delete it in `afterEach`, including when an assertion failed or the test timed out. Happy-path `finally` is not enough.

Call `installSavedStatementTeardown()` at the start of every describe that can create a row. UI creates go through `submitSavedStatementCreate()` (waits for POST 201, then records the id). Node/API creates call `trackSavedStatement()` immediately after the create body is parsed.

Teardown DELETE 404 is success (the test may already have deleted the row). Any other teardown failure fails the test. Shared template fixtures created in `beforeAll` are tracked as well and deleted in `afterAll` (404 is success). Other E2E resource types are unchanged. No route mocks, `page.evaluate` HTTP, forced clicks, or skips.
