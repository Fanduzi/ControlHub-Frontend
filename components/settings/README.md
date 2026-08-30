# Settings components

Settings-page controls and administrator-gated entry points.

## Members

| File | Responsibility |
|------|----------------|
| `accent-switcher.tsx` | Selects the console accent color. |
| `language-switcher.tsx` | Selects the active locale. |
| `machine-principal-entry.tsx` | Links administrators to machine credential lifecycle management. |
| `machine-principal-settings.tsx` | Issues, rotates, revokes, and displays safe credential lifecycle records. |
| `owners-section.tsx` | Displays owners in Settings. |
| `query-credential-entry.tsx` | Links administrators to query credential management. |
| `query-credential-settings.tsx` | Manages query credential metadata. |
| `query-disclosure-entry.tsx` | Links administrators to disclosure policies. |
| `query-disclosure-settings.tsx` | Manages disclosure policies with scoped or all-environment target search and pagination. |
| `theme-toggle.tsx` | Selects the console theme. |

## Interfaces

- `MachinePrincipalEntry` exposes the admin-gated `/settings/machine-principals` route.
- `MachinePrincipalSettings` keeps one-time secrets transient, requires explicit replacement scopes for rotation, and never infers scopes from safe lifecycle metadata.

## Dependencies

- Upstream: locale, presentation role, settings services, and machine-principal service/types.
- Downstream: the Settings overview and direct administrator settings routes.
