# Frontend tests

Frontend Vitest and route-level contract tests.

List-page coverage verifies normalized pagination, server search, audit environment
scope, settings taxonomy flow, and fail-closed behavior for unknown environment scopes.

Topology tests cover graph rendering for isolated nodes, database cluster-group
labels, canonical deep links, root selection/clearing, and fail-closed scopes.

## Members

| Directory/file | Responsibility |
|---|---|
| `components/` | React component behavior, including URL-owned audit search |
| `services/` | API service serialization and controlled-error behavior |
| `lib/` | Shared list URL parsing and utility contracts |
| `pages.list-pagination.test.tsx` | Verifies list-page parameter normalization, server search/pagination requests, settings dictionaries, and table data flow. |
| `pages.query.test.tsx` | Verifies Query Workbench URL scope and fail-closed explicit target selection. |
| `topology-page.test.tsx` | Verifies server resolution of canonical topology environment/root URL state. |

## Interfaces

- Vitest unit and component test suites run through `npm test`.
- Page tests assert normalized URL parameters reach server data loaders, explicit invalid Query Workbench targets remain unselected, and empty database-cluster detail panels remain visible.

## Dependencies

- Upstream: frontend components, services, and shared libraries
- Downstream: none
