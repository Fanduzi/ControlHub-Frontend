# tests

Frontend Vitest and route-level contract tests.

List-page coverage verifies normalized pagination, settings taxonomy flow, and
fail-closed behavior for unknown environment scopes.

## Files

| File | Responsibility |
|------|---------------|
| `pages.list-pagination.test.tsx` | Verifies list-page parameter normalization, pagination requests, and table data flow. |

## Dependencies

- Upstream: application pages, view-model services, and settings services
- Downstream: Vitest and Testing Library assertions
