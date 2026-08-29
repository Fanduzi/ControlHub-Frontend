# app/api/operator-session

Console BFF session routes (Phase 38X-1C).

| Method | Purpose |
|--------|---------|
| `POST /api/operator-session` | Interactive login: calls the backend login API server-side, seals the Backend Bearer Credential and operator identity into an HttpOnly Operator Session cookie, and returns identity + role without the credential |
| `GET /api/operator-session` | Returns the authenticated operator email/display name and role from the sealed session; never returns the credential |
| `DELETE /api/operator-session` | Logout: clears the Operator Session cookie |

Unsafe methods require the exact configured Console Origin. All authentication
failures map to one generic `401 { error: "unauthorized", message: "unauthorized" }`
outcome; the Backend Bearer Credential never appears in a response body. Cookie
set/clear attributes are shared with the proxy via
`lib/operator-session/session-cookie.ts`. Synthesized BFF errors use
`{ error, message }` with a snake_case Controlled Error Code.
