# services

Frontend API service modules.

`api-client.ts` routes every browser fetch through `/api/proxy` without client Authorization. Server/RSC unseals the Operator Session cookie when calling the backend directly; browser 401 responses clear presentation state and redirect to login.

`audits.ts` maps a 403 from resource audit reads to an empty timeline for
non-admin operators (the server stays authoritative); other failures surface
normally.

