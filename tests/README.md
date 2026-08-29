# Frontend tests

Frontend Vitest and route-level contract tests.

List-page coverage verifies normalized pagination and server search, settings
taxonomy flow, and fail-closed behavior for unknown environment scopes.

## Members

| Directory/file | Responsibility |
|---|---|
| `components/` | React component behavior, including URL-owned audit search |
| `services/` | API service serialization and controlled-error behavior |
| `lib/` | Shared list URL parsing and utility contracts |
| `pages.list-pagination.test.tsx` | Verifies list-page parameter normalization, server search/pagination requests, settings dictionaries, and table data flow. |

## Interfaces

- Vitest unit and component test suites run through `npm test`.
- Page tests assert normalized URL parameters reach server data loaders.

## Dependencies

- Upstream: frontend components, services, and shared libraries
- Downstream: none
