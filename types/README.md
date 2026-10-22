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
| `query-execution.ts` | Governed execution/history metadata, server-owned restore eligibility, owner-only statement response contracts, the `cellTruncated` result-matrix contract shared by execute and related-records responses, the terminal-execution/orphan-claim history union, and the PostgreSQL `database`/`schema`/`clientExecutionId` request fields |
| `query-target.ts` | Query target read model incl. composite `connections[]` rows (database, defaultSchema, engine, runtime, enabled) that drive the PostgreSQL worksheet context |
| `query-schema.ts` | Schema catalog wire contracts (databases, schemas, objects, details, relationship map) incl. the PostgreSQL `schema` request/response fields |
| `query-workspace.ts` | Persisted worksheet draft aggregate (incl. `activeDatabase`/`activeSchema` pins) and optimistic-concurrency request contract |
| `query-saved-statement.ts` | Saved statement records, parameter definitions, and execute contract incl. the PostgreSQL `database`/`schema` scope fields |

`audit.ts` defines the append-only audit event contract. Inventory events may
include server-owned field changes with a domain field name, operation, and
optional before/after values; legacy and non-inventory events omit `changes`.
Its optional browser-side `actor` projection accepts rolling backend deployments
and displays only the server-selected user or machine label. Audit list requests
include optional server-owned `q` search and numeric `environmentId` filters.

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

`query-workspace.ts` intentionally contains only worksheet id, name, target,
statement, active database, and the optional PostgreSQL `activeSchema` pin;
results, credentials, templates, paging, and active-tab state are not
transport fields.

## Interfaces

- Exported types are compile-time transport contracts; they have no runtime behavior.

## Dependencies

- Upstream: backend OpenAPI JSON schemas
- Downstream: frontend services, components, and tests
