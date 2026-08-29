# tests/services

Vitest unit tests for `services/*`.

`resources.test.ts` also locks the typed-profile DELETE service contract used
by the confirmed resource-edit clear action.

| File | Coverage |
|------|----------|
| `api-client.test.ts` | BFF proxy base URL, unsafe integers, no browser Authorization (incl. stale legacy bearer storage), BFF 401 session handling, JSON `error` preserved as `ApiError.code`, missing `error` not mapped from status |
| `audits.test.ts` | Audit list/pagination forwarding, resource audit paths, operator-boundary 403 degradation to empty |
| `e2e-api-helpers.test.ts` | E2E API helper contracts — fixture-based auth body, fail-loud without fixture env, default typed-profile identity |
