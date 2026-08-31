# tests/app

Vitest tests for the Next.js app boundary.

| File | Coverage |
|------|----------|
| `cmdb-page.test.tsx` | Retained `/cmdb` bookmark renders a translated migration notice and accessible `/resources` link |
| `overview-page.test.tsx` | Overview parses its environment cookie while an explicit All URL overrides stale persisted scope |
| `not-found.test.tsx` | Generic and resource-specific 404 boundaries render localized copy and the correct recovery links |
| `login-page.test.tsx` | Public login form validation renders localized errors and successful login accepts only safe root-relative return paths |
| `proxy.test.ts` | Console route guard: only valid unexpired Operator Sessions pass; invalid sessions preserve the protected path and query when redirecting to login; a valid session on `/login` redirects to the console |

Route-handler tests live under `tests/app/api/` (see its README).
