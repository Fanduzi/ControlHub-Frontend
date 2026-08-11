# services

Frontend API service modules.

`api-client.ts` resolves credentials on the browser (sessionStorage/legacy cookie) and on the server (sealed Operator Session cookie, then legacy token cookie) before calling the backend.

