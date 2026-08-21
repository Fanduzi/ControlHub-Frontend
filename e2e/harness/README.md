# e2e/harness

Shared Playwright harness helpers and the E2E dev-server wrapper.

| File | Purpose |
|------|---------|
| `auth.ts` | UI login helper through the Console BFF login form using the provisioned per-run fixture identity (admin default, editor explicit) |
| `backend-health.ts` | Backend health check |
| `console-guards.ts` | Console/network error collection and one-shot expected-error consumption |
| `dev-server-wrapper.sh` | Dev-server wrapper; sets the E2E proxy target and the Console BFF local-development configuration (fixed dev sealing key, Console Origin `http://localhost:3100`, explicit non-Secure cookie exception) |
| `fixtures.ts` | Fail-loud fixture identity resolver (`E2E_FIXTURE_ADMIN_*` / `E2E_FIXTURE_EDITOR_*`); refuses the retired 0002 seed accounts — no fallback. Consumes identities provisioned by the backend `cmd/e2e-fixture-bootstrap` seam (on backend main, shipped as ticket #19; frontend CI already calls it) |
| `interaction-stability.ts` | Interaction stability helpers |
| `saved-statement-teardown.ts` | Guaranteed Query Workbench Saved Statement cleanup: `installSavedStatementTeardown()` registers `afterEach` DELETE; 404 is success; other teardown errors fail the test |
