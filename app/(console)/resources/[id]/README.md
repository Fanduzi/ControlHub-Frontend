# Resource Detail Page Module

Server-rendered full resource inspection page.

## Files

| File | Responsibility |
|------|---------------|
| page.tsx | Loads a known resource or calls `notFound()` for malformed, unsafe, missing, or unavailable IDs; renders identity, effective health evidence, topology, relations, and audit context, remounting topology state across archive changes |
| not-found.tsx | Shows the localized missing-or-archived message and links back to `/resources` |

## Interfaces

- Route: `/resources/[id]`.
- Consumes `getResourceViewModel(id)` and displays status, freshness, observed time, and observer through `HealthEvidence`.

## Dependencies

- Upstream: resource route parameter and backend-backed view model services.
- Downstream: shared detail, health, database, topology, relation, and audit components.

## Update Rule

If page members, interfaces, or dependencies change, update this file.
