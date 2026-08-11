# components/app-shell

Console shell chrome (sidebar, topbar, layout).

The topbar uses presentation-only role state to hide resource-creation affordances
for non-admin users. Sign-out calls `DELETE /api/operator-session` and clears
browser-readable presentation state.
