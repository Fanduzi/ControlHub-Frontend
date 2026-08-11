# tests/app

Vitest tests for the Next.js app boundary.

| File | Coverage |
|------|----------|
| `proxy.test.ts` | Console route guard: only valid unexpired Operator Sessions pass; browser bearer cookies redirect to login; forged, tampered, unknown-key, expired, and unverifiable sessions fail closed (Phase 38X-1D) |

Route-handler tests live under `tests/app/api/` (see its README).

