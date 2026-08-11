# tests/services

Vitest unit tests for `services/*`.

| File | Coverage |
|------|----------|
| `api-client.test.ts` | BFF proxy base URL, unsafe integers, no browser Authorization (incl. stale legacy bearer storage), BFF 401 session handling |
| `audits.test.ts` | Audit list/pagination forwarding, resource audit paths, operator-boundary 403 degradation to empty |

