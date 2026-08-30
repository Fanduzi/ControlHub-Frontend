# app/(console)/settings/query-disclosure-policies

Authenticated administrator route for query disclosure policies.

## Files

| File | Responsibility |
|---|---|
| `page.tsx` | Loads scoped targets, treats an omitted environment as All, and fails closed for explicit invalid environment values. |

## Interfaces

- `/settings/query-disclosure-policies` accepts the shared environment selector parameters.
- An omitted environment loads a bounded unscoped target page; unknown or invalid explicit scopes expose no targets.

## Dependencies

- Upstream: Next search parameters and the environment resolver
- Downstream: `QueryDisclosureSettings` and the query-target service
