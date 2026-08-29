# services

`resources.ts` complete-list helpers start at page one even when callers supply
a later page, and overview attention is filtered from the same scoped list.

Frontend API service modules.

## Files

| File | Responsibility |
|------|----------------|
| `api-client.ts` | Same-origin BFF JSON transport and controlled errors |
| `resources.ts` | Inventory list/detail and mutation requests |
| `named-inventory-views.ts` | Personal/shared named-view CRUD requests |
| `machine-principals.ts` | Admin machine-principal list, issue, rotate, and revoke calls |

`api-client.ts` routes every fetch (browser and server/RSC) through the
same-origin BFF `/api/proxy` without client Authorization; the proxy attaches
the server-held credential from the HttpOnly Operator Session cookie. JSON
error envelopes preserve `error` as `ApiError.code` and the parsed body as
`ApiError.body`; a body that omits `error` does not invent a business code
from HTTP status. Browser 401 responses still
clear presentation state and redirect to login, and they keep `code` when the
envelope carries it.

`query-executions.ts` and `query-saved-statements.ts` classify feature
failures only by `ApiError.code`. Missing codes, non-JSON, and transport
failures become retryable `service_unavailable`. HTTP 401 stays a Controlled
Authorization Error and is not wrapped as a workbench feature error.

`audits.ts` maps a 403 from resource audit reads to an empty timeline for
non-admin operators (the server stays authoritative); global audit list search
is forwarded as `q`; other failures surface normally.

`resources.ts` sends typed-profile edits through PATCH, strips server-derived
completeness from resource writes, exposes explicit profile deletion, and
fetches source-specific relationship rules without embedding the matrix in the
console; it also owns effective-value reads and versioned override set/clear
requests. It also exposes bulk resource mutation preview and reviewed
confirmation calls; the server owns diffing, conflicts, and review
fingerprints. It sends controlled ingestion as native multipart `file`/`format`
requests and resubmits that exact file with the server-issued fingerprint; it
validates and exposes the returned replacement preview for recoverable ingestion
409s without parsing or reconciling inventory locally.

`named-inventory-views.ts` sends saved inventory-view state unchanged for
personal and shared view CRUD; update matches the backend's body-less 204
contract and never resends immutable scope.

`machine-principals.ts` lists only backend-safe credential lifecycle metadata;
plaintext remains confined to create and rotate responses.

## Interfaces

- Named-view list/create/update/delete functions expose the backend wire contract.

## Dependencies

- Upstream: typed request/response contracts in `types/`
- Downstream: same-origin Console BFF through `api-client.ts`
