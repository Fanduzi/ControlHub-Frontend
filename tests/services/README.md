# tests/services

Vitest unit tests for `services/*`.

`resources.test.ts` locks typed-profile deletion and source-specific
relationship-rule discovery at the frontend API boundary.

| File | Coverage |
|------|----------|
| `api-client.test.ts` | BFF proxy base URL, unsafe integers, no browser Authorization (incl. stale legacy bearer storage), BFF 401 session handling, JSON `error` preserved as `ApiError.code`, missing `error` not mapped from status |
| `audits.test.ts` | Audit list/pagination/search/filter forwarding, resource audit paths, operator-boundary 403 degradation to empty |
| `e2e-api-helpers.test.ts` | E2E API helper contracts — fixture-based auth body, fail-loud without fixture env, default typed-profile identity |
| `resources.test.ts` | Resource request paths and managed-identity create payloads |
