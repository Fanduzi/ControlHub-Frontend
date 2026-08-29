# tests/lib

Vitest unit tests for frontend library modules.

## Interfaces

- Tests exercise exported library functions with literal input/output contracts.

## Dependencies

- Upstream: production `lib/` modules and Vitest
- Downstream: none

`environment-params.test.ts` covers known-slug resolution and the fail-closed
unknown-slug behavior used by inventory list pages.

Operator Session BFF tests (Phase 38X-1C):

| File | Coverage |
|------|----------|
| `operator-session-config.test.ts` | Fail-closed configuration validation (base64-only keys, low-diversity key rejection, HTTPS-only production Origin, secure-cookie policy) |
| `operator-session-seal.test.ts` | Sealed cookie identity round-trip, eight-hour expiry, key rotation window (15 minutes), tamper rejection |
| `operator-session-origin.test.ts` | Console Origin guard on unsafe methods |
| `operator-session-backend.test.ts` | Server-side backend login and generic outcome mapping |
| `operator-session-response.test.ts` | BFF `bffJson` synthesized bodies include a snake_case Controlled Error Code on `error` |
| `auth-role.test.ts` | Presentation-only admin gate from the trusted BFF session; browser role tampering fails closed |
| `profile-field-registry.test.ts` | Core CI typed-profile identity flags and backend field-path mapping |
| `view-models.test.ts` | Resource and Database Estate view-model composition, including scoped server search across paginated database types |
| `list-page-search-params.test.ts` | Resource/audit URL parsing, including safe pagination/search normalization and repeated environment/label and owner filters |
