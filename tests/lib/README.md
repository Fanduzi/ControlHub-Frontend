# tests/lib

Vitest unit tests for frontend library modules.

Operator Session BFF tests (Phase 38X-1C):

| File | Coverage |
|------|----------|
| `operator-session-config.test.ts` | Fail-closed configuration validation (keys, Origin, secure-cookie policy) |
| `operator-session-seal.test.ts` | Sealed cookie round-trip, eight-hour expiry, key rotation window (15 minutes), tamper rejection |
| `operator-session-origin.test.ts` | Console Origin guard on unsafe methods |
| `operator-session-backend.test.ts` | Server-side backend login and generic outcome mapping |
| `auth-role.test.ts` | Presentation-only admin role recovery from BFF role storage/cookie; bearer-shaped values are ignored |
# note: auth-role recovery tests cover role-cookie path
