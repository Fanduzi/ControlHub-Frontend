# tests/app

Vitest tests for the Next.js app boundary.

| File | Coverage |
|------|----------|
| `cmdb-page.test.tsx` | Retained `/cmdb` bookmark renders a translated migration notice and accessible `/resources` link |
| `overview-page.test.tsx` | Overview parses its environment cookie and scopes the combined server loader |
| `not-found.test.tsx` | Generic and resource-specific 404 boundaries render localized copy and the correct recovery links |
| `login-page.test.tsx` | Public login form validation renders localized required and malformed-email errors |
| `proxy.test.ts` | Console route guard: only valid unexpired Operator Sessions pass; browser bearer cookies redirect to login; forged, tampered, unknown-key, expired, and unverifiable sessions fail closed; a valid session on `/login` redirects to the console (Phase 38X-1D; Issue #23 base64 key enforcement) |

Route-handler tests live under `tests/app/api/` (see its README).
