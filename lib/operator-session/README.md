# lib/operator-session

Server-side Operator Session boundary for the Console BFF (Phase 38X-1C).

| File | Purpose |
|------|---------|
| `constants.ts` | Session cookie name and the fixed eight-hour maximum age / 15-minute previous-key rotation window |
| `config.ts` | Fail-closed BFF configuration: sealing keys, Console Origin, secure-cookie policy |
| `seal.ts` | AES-256-GCM sealed session cookie (active key + short previous-key rotation window) |
| `origin.ts` | Same-origin guard: unsafe methods require the exact configured Console Origin |
| `backend.ts` | Server-side backend login call with generic outcome mapping |
| `session-cookie.ts` | Shared Operator Session cookie set/clear helpers (HttpOnly, SameSite=Strict, Path, Secure policy) |
| `response.ts` | Controlled BFF JSON outcomes with `Cache-Control: no-store` |

## Configuration

| Env var | Required | Meaning |
|---------|----------|---------|
| `CONTROLHUB_BFF_SESSION_KEY` | yes | Active 32-byte sealing key (44 base64 chars; hex rejected) |
| `CONTROLHUB_BFF_PREVIOUS_SESSION_KEY` | no | Previous key accepted during the short rotation window (base64 only) |
| `CONTROLHUB_BFF_CONSOLE_ORIGIN` | yes | The single configured Console Origin (HTTPS required in production; HTTP allowed only in local development) |
| `CONTROLHUB_BFF_SECURE_COOKIES` | no | `true` (default) or `false`; `false` is rejected in production |

Production startup fails closed when any of these are missing, malformed, or
unsafe; see `instrumentation.ts` and `README.md` at the repo root.

Legacy browser bearer storage and cookies are not accepted or produced.
