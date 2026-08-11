# components/app-shell

Console shell chrome (sidebar, topbar, layout).

The topbar uses presentation-only role state to hide resource-creation affordances
for non-admin users. Sign-out calls `DELETE /api/operator-session` and clears
browser-readable presentation state; it is fail-closed — if the BFF logout fails
(network or non-2xx), the console stays put with a controlled error instead of
presenting a logged-out UI while the HttpOnly Operator Session cookie survives.
