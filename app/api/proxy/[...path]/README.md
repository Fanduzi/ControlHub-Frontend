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
  one generic `401 { error: "unauthorized", message: "unauthorized" }` and the
  rejected cookie is cleared (`authenticateCookie` in
  `lib/operator-session/facade.ts`).
- Backend `401` maps to the same generic coded outcome; non-401 upstream
  bodies (including `error`) are forwarded unchanged and do not clear the
  session.
- Upstream response headers (including `Location` on redirects) are relayed;
  upstream `Set-Cookie` and `access-control-*` headers are never forwarded,
  and `Cache-Control` is always `no-store`.
- Request bodies are capped at 10 MiB (`413` beyond the cap), enforced both
  on `Content-Length` and while streaming chunked bodies.

Cancellation and exchange failure:

- The inbound request signal and the 30-second upstream timeout are composed
  with `AbortSignal.any`, so a browser disconnect aborts the upstream fetch
  across the whole exchange (headers wait and body streaming alike).
- One classification boundary wraps inbound body buffering, the upstream
  fetch, and the upstream response-body read: a client-triggered abort on
  any leg returns a bare `499` with no fabricated error envelope, and an
  upstream-side failure (unreachable, socket drop, or body-read timeout)
  without inbound cancellation maps to coded `503 service-unavailable` —
  raw driver/network errors never escape the route.

Blocked upstream prefixes: `auth/*` (never mint browser-visible tokens through the proxy).
