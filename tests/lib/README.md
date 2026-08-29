# tests/lib

Vitest unit tests for frontend library modules.

`environment-params.test.ts` covers known-slug resolution and the fail-closed
unknown-slug behavior used by inventory list pages.

Operator Session BFF tests (Phase 38X-1C):

| File | Coverage |
|------|----------|
| `operator-session-config.test.ts` | Fail-closed configuration validation (base64-only keys, low-diversity key rejection, HTTPS-only production Origin, secure-cookie policy) |
| `operator-session-seal.test.ts` | Sealed cookie round-trip, eight-hour expiry, key rotation window (15 minutes), tamper rejection |
| `operator-session-origin.test.ts` | Console Origin guard on unsafe methods |
| `operator-session-backend.test.ts` | Server-side backend login and generic outcome mapping |
| `operator-session-response.test.ts` | BFF `bffJson` synthesized bodies include a snake_case Controlled Error Code on `error` |
| `auth-role.test.ts` | Presentation-only admin role recovery from BFF role storage/cookie; bearer-shaped values are ignored |
# note: auth-role recovery tests cover role-cookie path
