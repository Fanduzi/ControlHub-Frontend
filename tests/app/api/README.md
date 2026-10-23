# tests/app/api

Vitest tests for Console BFF route handlers (Phase 38X-1C).

| File | Coverage |
|------|----------|
| `operator-session-route.test.ts` | Login sets an opaque HttpOnly sealed cookie and never returns the backend credential; logout clears it; origin and config fail-closed behavior (Issue #23 base64 key enforcement); synthesized errors include a snake_case Controlled Error Code |
| `operator-session-identity.test.ts` | Real sealed identity round-trip through session GET without credential disclosure |
| `proxy-route.test.ts` | Protected proxy forwards with the server-held credential, rejects client `Authorization`, rejects unsafe cross-origin requests, maps backend auth failures to coded generic outcomes, forwards non-401 upstream `error` unchanged, relays 3xx `Location`, never forwards upstream `Set-Cookie` (Issue #23 base64 key enforcement), and composes inbound cancellation with the 30s timeout — an already-, mid-flight-, or response-body-streaming-aborted client returns bare `499` and aborts upstream, while an upstream-side failure (unreachable, real-socket mid-body drop, or body-read timeout via the shortened backstop leg) without inbound cancellation maps to `503 service-unavailable`; the classification covers inbound body buffering too (aborted upload → `499`, failed upload stream → `503`, zero upstream calls) |
