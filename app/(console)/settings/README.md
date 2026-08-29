# Settings routes

Authenticated Settings overview and direct administration routes.

## Members

| File | Responsibility |
|------|----------------|
| `page.tsx` | Server-rendered Settings overview with admin-gated management entries. |
| `machine-principals/page.tsx` | Machine-principal lifecycle route. |
| `query-disclosure-policies/page.tsx` | Query disclosure policy route. |

## Interfaces

- `/settings` exposes configuration and administration discovery.
- `/settings/machine-principals` exposes administrator-only credential lifecycle management.

## Dependencies

- Upstream: `next-intl` server translations and Settings services.
- Downstream: Settings components and authenticated console navigation.
