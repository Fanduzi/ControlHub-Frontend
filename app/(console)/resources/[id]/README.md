# Resource Detail Page Module

Server-rendered full resource inspection page.

## Files

| File | Responsibility |
|------|---------------|
| page.tsx | Loads a known resource or calls `notFound()` for malformed, unsafe, missing, or unavailable IDs; renders identity, health evidence, archive-state-remounted topology, directed relation creation context, and audit context |
| not-found.tsx | Shows the localized missing-or-archived message and links back to `/resources` |

## Interfaces

- Route: `/resources/[id]`.
- Consumes `getResourceViewModel(id)` and passes the current resource type and environment to relation creation so selected source-to-target rules can be validated.

## Dependencies

- Upstream: resource route parameter and backend-backed view model services.
- Downstream: shared detail, health, database, topology, relation, and audit components.

## Update Rule

If page members, interfaces, or dependencies change, update this file.
