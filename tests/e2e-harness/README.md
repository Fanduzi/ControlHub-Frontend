# tests/e2e-harness

Vitest unit tests for the Playwright E2E harness helpers.

| File | Coverage |
|------|----------|
| `console-guards.test.ts` | Console/network guard parsing and one-shot expected-error consumption |
| `fixtures.test.ts` | Fixture identity resolver: fail-loud on missing/blank env, explicit admin/editor identities, refusal of the retired 0002 seed accounts (no fallback) |
| `interaction-stability.test.ts` | Interaction stability helpers |
| `query-workbench-selection-policy.test.ts` | Query workbench target selection policy, including idempotent current-target handling that prevents duplicate workspace writers |
| `saved-statement-teardown.test.ts` | Saved Statement E2E teardown: create-URL identity, DELETE 404 is success, non-404 and thrown DELETE fail the run |
