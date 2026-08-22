# e2e

Playwright end-to-end tests running against real Chromium with a live backend.

## Specs

| Spec | Coverage |
|------|----------|
| operator-session.spec.ts | Console BFF boundary (38X-1C/38X-1D): BFF login seals HttpOnly Operator Session cookie; proxy forwards server-held credential; client Authorization and unsafe Origin rejected; logout (API + real UI) and forged/tampered/expired page gate; fail-closed UI sign-out under network failure; legacy controlhub.token alone rejected; desktop EN / 375px EN / desktop zh-CN coverage; no backend bearer in browser storage/DOM/readable cookies |
| query-workbench.spec.ts | Query workbench shell, schema explorer, FK navigation, object inspector, paging, saved statements, guaranteed Saved Statement teardown (`afterEach`; DELETE 404 is success), terminal delete 404-absence (desktop EN / 375px EN / desktop zh-CN), 375 search-on-own-row and no overflow, explain, relationship map, shared-template affordance, shared template execution, disposal, schema metadata identity isolation (one database-list request per load generation, reuse on database selection, null-default behavior, 375/zh-CN no-overflow), 375/zh-CN session, no-leakage assertions, list pagination |
| console-ux.spec.ts | Console layout and UX checks |
| databases-sheet.spec.ts | Databases sheet interactions |
| list-pagination.spec.ts | List pagination behavior |
| login.spec.ts | Login flow |
| operator-console-smoke.spec.ts | Operator console smoke tests |
| operator-database-workflow.spec.ts | Operator database workflow |
| operator-interaction-stability.spec.ts | Operator interaction stability |
| query-credential-settings.spec.ts | Query credential settings (admin flows; cookie-only role recovery under BFF) |
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
| harness/console-guards.ts | Console/network error guards |
| harness/dev-server-wrapper.sh | Dev server wrapper for E2E |
| harness/interaction-stability.ts | Interaction stability helpers |
| harness/saved-statement-teardown.ts | Query Workbench Saved Statement teardown: record create ids, `afterEach` DELETE (404 is success; any other failure fails the test) |
| api.helpers.ts | Authenticated API helpers |
| api-proxy.mjs | API proxy for same-origin E2E requests |

## Saved Statement teardown

Query Workbench tests that create a Saved Statement must record `{ id, targetResourceId }` and delete it in `afterEach`, including when an assertion failed or the test timed out. Happy-path `finally` is not enough.

Call `installSavedStatementTeardown()` at the start of every describe that can create a row. UI creates go through `submitSavedStatementCreate()` (waits for POST 201, then records the id). Node/API creates call `trackSavedStatement()` immediately after the create body is parsed.

Teardown DELETE 404 is success (the test may already have deleted the row). Any other teardown failure fails the test. Shared template fixtures created in `beforeAll` are tracked as well and deleted in `afterAll` (404 is success). Other E2E resource types are unchanged. No route mocks, `page.evaluate` HTTP, forced clicks, or skips.
