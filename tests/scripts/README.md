# tests/scripts

Vitest tests for repo scripts and CI checkers.

| File | Coverage |
|------|----------|
| `cdp-release-smoke.test.ts` | CDP release smoke helper contracts |
| `check-controlled-error-codes.test.ts` | Controlled Error Code checker against backend OpenAPI |
| `check-e2e-governance.test.ts` | E2E governance checker behavior |
| `check-e2e-pg-fixture.test.ts` | PG fixture manifest/pin validation |
| `check-e2e-preflight.test.ts` | E2E preflight checker behavior |
| `check-node-runtime.test.ts` | Node runtime gate |
| `check-npm-audit.test.ts` | Blocks high and critical advisories (including the formerly exempt ID); moderate advisories remain non-blocking |
| `pg-fixture-lifecycle.test.ts` | Real-subprocess fixture lifecycle over a stub PATH: up/down/evidence over `pg-fixture-*.sh`, allocating two distinct free loopback ports per test via `node:net` `listen(0)` (held until both selected, closed before the harness) so parallel runs never adopt fixed ports; includes lsof ownership prechecks and failure-mode proofs |
