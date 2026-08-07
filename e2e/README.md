# e2e

Playwright end-to-end tests running against real Chromium with a live backend.

## Specs

| Spec | Coverage |
|------|----------|
| query-workbench.spec.ts | Query workbench shell, schema explorer, FK navigation, object inspector, paging, saved statements, explain, relationship map, shared-template affordance, shared template execution, disposal, 375/zh-CN session, no-leakage assertions, list pagination |
| console-ux.spec.ts | Console layout and UX checks |
| databases-sheet.spec.ts | Databases sheet interactions |
| list-pagination.spec.ts | List pagination behavior |
| login.spec.ts | Login flow |
| operator-console-smoke.spec.ts | Operator console smoke tests |
| operator-database-workflow.spec.ts | Operator database workflow |
| operator-interaction-stability.spec.ts | Operator interaction stability |
| query-credential-settings.spec.ts | Query credential settings |
| resource-archive.spec.ts | Resource archiving |
| resources-sheet.spec.ts | Resources sheet |
| settings.spec.ts | Settings page |
| topology.spec.ts | Topology view |

## Helpers

| File | Purpose |
|------|---------|
| harness/backend-health.ts | Backend health check |
| harness/auth.ts | UI login helper |
| harness/console-guards.ts | Console/network error guards |
| harness/dev-server-wrapper.sh | Dev server wrapper for E2E |
| harness/interaction-stability.ts | Interaction stability helpers |
| api.helpers.ts | Authenticated API helpers |
| api-proxy.mjs | API proxy for same-origin E2E requests |
