# app/(console)/query

Server route for the authenticated Query Workbench.

## Files

| File | Responsibility |
|---|---|
| `page.tsx` | Resolves environment and target URL state, loads bounded unscoped targets for All, preserves default selection only when `targetId` is absent, and fails closed for explicit invalid or unavailable values. |

## Interfaces

- `/query` accepts environment, target, and workbench filter search parameters; an omitted environment means All.
- Explicit invalid or unavailable `targetId` passes an unselected workbench state; an omitted `targetId` preserves the default target selection.

## Dependencies

- Upstream: Next page search parameters
- Downstream: `QueryWorkbench`, environment resolution, and query-target service
