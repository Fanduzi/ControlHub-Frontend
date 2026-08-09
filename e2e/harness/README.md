# e2e/harness

Shared Playwright harness helpers and the E2E dev-server wrapper.

| File | Purpose |
|------|---------|
| `auth.ts` | UI login helper through the legacy login form |
| `backend-health.ts` | Backend health check |
| `console-guards.ts` | Console/network error collection and one-shot expected-error consumption |
| `dev-server-wrapper.sh` | Dev-server wrapper; sets the E2E proxy target and the Console BFF local-development configuration (fixed dev sealing key, Console Origin `http://localhost:3100`, explicit non-Secure cookie exception) |
| `interaction-stability.ts` | Interaction stability helpers |
