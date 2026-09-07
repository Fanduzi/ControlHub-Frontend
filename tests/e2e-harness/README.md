# tests/e2e-harness

Vitest unit tests for the Playwright E2E harness helpers.

| File | Coverage |
|------|----------|
| `console-guards.test.ts` | Console/network guard parsing, one-shot expected-error consumption, and optional one-shot consume for logout-race 401s |
| `fixtures.test.ts` | Fixture identity resolver: fail-loud on missing/blank env, explicit admin/editor identities, refusal of the retired 0002 seed accounts (no fallback) |
| `interaction-stability.test.ts` | Interaction stability helpers |
| `query-workbench-selection-policy.test.ts` | Query workbench ownership and target-selection policy, including single-writer execution and idempotent current-target handling |
| `saved-statement-teardown.test.ts` | Saved Statement E2E teardown: create-URL identity, DELETE 404 is success, non-404 and thrown DELETE fail the run |
