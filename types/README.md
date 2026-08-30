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
| `machine-principal.ts` | One-time credential issue plus safe reload lifecycle metadata |

`audit.ts` defines the append-only audit event contract. Inventory events may
include server-owned field changes with a domain field name, operation, and
optional before/after values; legacy and non-inventory events omit `changes`.
Audit list requests include optional server-owned `q` search and numeric `environmentId` filters.

`resource.ts` defines immutable resource origin plus managed aliases and global
external system/value identifiers for create, update, and response contracts,
server-derived completeness on reads, plus the backend-owned relationship-rule
discovery response, effective-value provenance, and supported override fields
used by the console. It also defines the closed atomic bulk mutation request,
versioned targets, optional owner/environment/lifecycle field patch, explicit
label operations, and server preview contracts.

`named-inventory-view.ts` defines the saved inventory view contract. Repeated
environment and label values remain arrays, while owner identity remains a
JSON number, matching OpenAPI exactly.

`machine-principal.ts` keeps one-time issue data separate from listed
credential lifecycle metadata, which exposes only IDs and timestamps.

## Interfaces

- Exported types are compile-time transport contracts; they have no runtime behavior.

## Dependencies

- Upstream: backend OpenAPI JSON schemas
- Downstream: frontend services, components, and tests
