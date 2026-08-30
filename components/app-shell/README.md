# components/app-shell

Console shell chrome (sidebar, topbar, layout). The topbar reads the current
operator email/display name and role from the no-store BFF session response;
it does not use translations as identity or persist credentials.
It refreshes that identity on console route changes and clears it if the BFF
session read fails or returns unauthenticated.

The topbar uses the trusted BFF session role to hide resource-creation affordances
for non-admin users; it never trusts browser storage or readable role cookies.
Sign-out calls `DELETE /api/operator-session`; it is fail-closed — if the BFF logout fails
(network or non-2xx), the console stays put with a controlled error instead of
presenting a logged-out UI while the HttpOnly Operator Session cookie survives.

The command palette keeps page navigation, workspace, and theme commands in its
empty-query state. A nonblank query searches the unified inventory through the
resources service with `pageSize=10`, then shows the localized resource type,
environment name, and health context before opening `/resources/{id}`. Debounce,
generation checks, and failure fallback prevent stale or failed searches from
changing the active results.

The environment selector writes readable `environment` slugs for Query Workbench
and query disclosure policies while preserving their URL-owned filters.
