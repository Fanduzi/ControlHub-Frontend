# tests/app

Vitest tests for the Next.js app boundary.

| File | Coverage |
|------|----------|
| `proxy.test.ts` | Console route guard: only valid unexpired Operator Sessions pass; browser bearer cookies redirect to login; forged, tampered, unknown-key, expired, and unverifiable sessions fail closed; a valid session on `/login` redirects to the console (Phase 38X-1D; Issue #23 base64 key enforcement) |

Route-handler tests live under `tests/app/api/` (see its README).

