# Frontend transport types

TypeScript contracts for backend JSON responses and frontend requests.

`resource.ts` includes server-derived completeness, effective health status,
`fresh`/`stale`/`never` freshness, observed time, observer, and nullable manual
override transport fields. A nullable update `healthStatus` clears the manual
override.
The new read fields are optional in the browser type only so a rolling frontend
deployment fails closed against an older backend payload.

## Files

| File | Responsibility |
|------|----------------|
| `resource.ts` | Inventory resource, pagination, and structured list-filter contracts |
| `named-inventory-view.ts` | Named-view filters, sort, columns, CRUD inputs, and responses |

`audit.ts` defines the append-only audit event contract. Inventory events may
include server-owned field changes with a domain field name, operation, and
optional before/after values; legacy and non-inventory events omit `changes`.
Audit list requests include the optional server-owned `q` search term.

`resource.ts` defines immutable resource origin plus managed aliases and global
external system/value identifiers for create, update, and response contracts,
server-derived completeness on reads, plus the backend-owned relationship-rule
discovery response, effective-value provenance, and supported override fields
used by the console. It also defines the closed bulk-label mutation request and
server preview contracts.

`named-inventory-view.ts` defines the saved inventory view contract. Repeated
environment and label values remain arrays, while owner identity remains a
JSON number, matching OpenAPI exactly.

## Interfaces

- Exported types are compile-time transport contracts; they have no runtime behavior.

## Dependencies

- Upstream: backend OpenAPI JSON schemas
- Downstream: frontend services, components, and tests
