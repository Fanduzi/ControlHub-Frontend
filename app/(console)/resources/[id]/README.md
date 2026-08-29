# Resource Detail Page Module

Database profile role values use the shared localized role vocabulary while other profile values remain unchanged.

Server-rendered full resource inspection page.

## Files

| File | Responsibility |
|------|---------------|
| page.tsx | Loads known resources or `notFound()`; renders health evidence, archive-state-remounted topology, directed relations, audit context, and an always-present localized cluster-members panel. |
| not-found.tsx | Shows the localized missing-or-archived message and links back to `/resources` |

## Interfaces

- Route: `/resources/[id]`.
- Consumes `getResourceViewModel(id)` and passes the current resource type and environment to relation creation so selected source-to-target rules can be validated.

## Dependencies

- Upstream: resource route parameter and backend-backed view model services.
- Downstream: shared detail, health, database, topology, relation, and audit components.

## Update Rule

If page members, interfaces, or dependencies change, update this file.
