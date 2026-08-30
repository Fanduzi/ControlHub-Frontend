# app/(console)/query

Server route for the authenticated Query Workbench.

## Files

| File | Responsibility |
|---|---|
| `page.tsx` | Resolves environment and target URL state, preserving default selection only when `targetId` is absent and failing closed for explicit invalid or unavailable values. |

## Interfaces

- `/query` accepts environment, target, and workbench filter search parameters.
- Explicit invalid or unavailable `targetId` passes an unselected workbench state; an omitted `targetId` preserves the default target selection.

## Dependencies

- Upstream: Next page search parameters
- Downstream: `QueryWorkbench`, environment resolution, and query-target service
