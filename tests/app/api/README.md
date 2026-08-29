# tests/app/api

Vitest tests for Console BFF route handlers (Phase 38X-1C).

| File | Coverage |
|------|----------|
| `operator-session-route.test.ts` | Login sets an opaque HttpOnly sealed cookie and never returns the backend credential; logout clears it; origin and config fail-closed behavior (Issue #23 base64 key enforcement); synthesized errors include a snake_case Controlled Error Code |
| `operator-session-identity.test.ts` | Real sealed identity round-trip through session GET without credential disclosure |
| `proxy-route.test.ts` | Protected proxy forwards with the server-held credential, rejects client `Authorization`, rejects unsafe cross-origin requests, maps backend auth failures to coded generic outcomes, forwards non-401 upstream `error` unchanged, relays 3xx `Location`, and never forwards upstream `Set-Cookie` (Issue #23 base64 key enforcement) |
