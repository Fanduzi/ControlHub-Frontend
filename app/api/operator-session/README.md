# app/api/operator-session

Console BFF session routes (Phase 38X-1C).

| Method | Purpose |
|--------|---------|
| `POST /api/operator-session` | Interactive login: calls the backend login API server-side and seals the Backend Bearer Credential into an HttpOnly Operator Session cookie; the response contains only the role |
| `DELETE /api/operator-session` | Logout: clears the Operator Session cookie |

Unsafe methods require the exact configured Console Origin. All authentication
failures map to one generic `401 { message: "unauthorized" }` outcome; the
Backend Bearer Credential never appears in a response body.
