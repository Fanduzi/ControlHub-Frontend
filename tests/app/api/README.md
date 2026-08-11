# tests/app/api

Vitest tests for Console BFF route handlers (Phase 38X-1C).

| File | Coverage |
|------|----------|
| `operator-session-route.test.ts` | Login sets an opaque HttpOnly sealed cookie and never returns the backend credential; logout clears it; origin and config fail-closed behavior |
| `proxy-route.test.ts` | Protected proxy forwards with the server-held credential, rejects client `Authorization`, rejects unsafe cross-origin requests, maps backend auth failures to generic outcomes, relays 3xx `Location`, and never forwards upstream `Set-Cookie` |

