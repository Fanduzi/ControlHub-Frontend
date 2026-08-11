# services

Frontend API service modules.

`api-client.ts` routes every fetch (browser and server/RSC) through the
same-origin BFF `/api/proxy` without client Authorization; the proxy attaches
the server-held credential from the HttpOnly Operator Session cookie. Browser
401 responses clear presentation state and redirect to login.

`audits.ts` maps a 403 from resource audit reads to an empty timeline for
non-admin operators (the server stays authoritative); other failures surface
normally.

