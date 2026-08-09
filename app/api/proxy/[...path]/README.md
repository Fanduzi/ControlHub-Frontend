# app/api/proxy

Protected same-origin Console BFF proxy (Phase 38X-1C).

`/api/proxy/[...path]` forwards any method to the backend using only the
server-held Backend Bearer Credential from the Operator Session cookie.

Guards:

- A client-supplied `Authorization` or `Proxy-Authorization` header is
  rejected with `400` and never forwarded.
- Unsafe methods (POST/PUT/PATCH/DELETE) require the exact configured
  Console Origin; anything else is rejected with `403`.
- Missing, malformed, tampered, expired, or unknown-key sessions all map to
  one generic `401 { message: "unauthorized" }` and the rejected cookie is
  cleared.
- Backend `401` maps to the same generic outcome; backend `403` maps to a
  generic forbidden outcome without clearing the session.
