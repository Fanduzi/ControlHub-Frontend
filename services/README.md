# services

Frontend API service modules.

`api-client.ts` routes every fetch (browser and server/RSC) through the
same-origin BFF `/api/proxy` without client Authorization; the proxy attaches
the server-held credential from the HttpOnly Operator Session cookie. JSON
error envelopes preserve `error` as `ApiError.code`; a body that omits `error`
does not invent a business code from HTTP status. Browser 401 responses still
clear presentation state and redirect to login, and they keep `code` when the
envelope carries it.

`query-executions.ts` and `query-saved-statements.ts` classify feature
failures only by `ApiError.code`. Missing codes, non-JSON, and transport
failures become retryable `service_unavailable`. HTTP 401 stays a Controlled
Authorization Error and is not wrapped as a workbench feature error.

`audits.ts` maps a 403 from resource audit reads to an empty timeline for
non-admin operators (the server stays authoritative); global audit list search
is forwarded as `q`; other failures surface normally.

`resources.ts` sends typed-profile edits through PATCH, exposes explicit
profile deletion, and fetches source-specific relationship rules without
embedding the matrix in the console; it also owns effective-value reads and
versioned override set/clear requests.
