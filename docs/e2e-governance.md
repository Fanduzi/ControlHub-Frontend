# E2E Governance

This document defines the rules for frontend browser tests in ControlHub.

## Required Commands

Before claiming a frontend phase is complete, run:

```bash
npx tsc --noEmit -p tsconfig.json
npm run lint
npm run test
npm run build
npm run check:e2e-governance
npm run test:e2e:smoke
npm run test:e2e:interaction
npm run test:e2e
```

`npm run test:e2e` must be fully green. If it is not green, do not call the
phase complete. Classify every failure with the table in "Failure
Classification".

## Auth Rule

Use `loginViaUI(page)` for E2E tests that navigate to application pages.
`loginViaUI` authenticates through the real Console BFF login form with the
provisioned per-run fixture identity.

### Fixture identities (38X-1D)

Real E2E never uses the published 0002 seed accounts
(`admin@example.com` / `editor@example.com` / `secret123`), which backend
migration 00016 disabled. Every E2E run must be provisioned with explicit
admin and editor fixture operators:

- Provisioning: backend `cmd/e2e-fixture-bootstrap` (TEST/CI-ONLY seam) or an
equivalent controlled path; it refuses the retired seed identities. The seam
requires an explicit test-mode capability and a dedicated disposable
`*_e2e` metadata DSN on a loopback host (see backend
`docs/decisions/2026-08-12-e2e-fixture-provisioning-safety-boundary.md`).
  The seam is on backend `main` (backend ticket #19). The frontend CI
workflow calls it, and `release-e2e` requires it.
- Consumption: `e2e/harness/fixtures.ts` resolves
  `E2E_FIXTURE_ADMIN_EMAIL` / `E2E_FIXTURE_ADMIN_PASSWORD` and
  `E2E_FIXTURE_EDITOR_EMAIL` / `E2E_FIXTURE_EDITOR_PASSWORD`.
- Missing or blank fixture env fails the run loudly before any browser
  starts. There is no seed fallback.
- Fixture passwords must never be printed in tests, logs, evidence, or CI
  output; only the non-sensitive fixture emails/roles may be recorded.
- Note: `.invalid` fixture emails are an additional hygiene guard, NOT the
  production-safety boundary; the backend seam's DSN/capability gates are.

### BFF operator-session login (38X-1C)

`e2e/operator-session.spec.ts` authenticates through the Console BFF
(`POST /api/operator-session`) using Playwright's `page.request`
(APIRequestContext), which shares the browser context's cookie jar, and then
navigates application pages with `page.goto`. This is the intended mechanism
for BFF boundary tests: the BFF flow sets an HttpOnly Operator Session cookie
that server components can read. Requests must go through `page.request` or
real page interaction — never `page.evaluate`; storage-leak assertions may
read browser storage (read-only) and cookies via `context.cookies()`. The
spec must prove the boundary (HttpOnly sealed cookie, no Backend Bearer
Credential in browser storage or browser-readable cookies, logout clearing)
and use the console/network guards like any application-page spec.

## Console And Network Guards

Application-page E2E specs must use:

```ts
collectConsoleMessages(page)
collectNetworkErrors(page)
assertClean(consoleMessages, networkErrors)
```

Allowed warnings/errors must be local to the spec and precise. Do not add broad
global suppressions.

## Process Output Rule

Do not use:

```ts
stderr: "ignore"
stdout: "ignore"
```

Do not use shell redirection that hides complete process output:

```bash
2>/dev/null
>/dev/null
```

Known runtime noise may be filtered only by exact documented pattern. Current
allowed dev-server noise:

```text
controller[kState].transformAlgorithm
```

All other stderr/stdout must pass through.

## Screenshot Rule

Do not screenshot every successful test.

Failure-only screenshots are allowed:

```ts
if (testInfo.status !== testInfo.expectedStatus) {
  await page.screenshot({ path, fullPage: true });
}
```

Screenshot filename patterns must be gitignored.

## Failure Classification

If full E2E fails, classify each failure:

| Test | URL | Failing locator/assertion | Classification | Root cause | Next action |
|---|---|---|---|---|---|

Allowed classifications:

- `obsolete-test`
- `real-regression`
- `environment-dependent`
- `covered-by-new-gate`
- `needs-product-decision`

Do not write "pre-existing" without this table.

## Interaction Gate Triggers

Run `npm run test:e2e:interaction` after touching:

- sheet/dialog code
- dropdown/multi-select code
- resource/database table row handling
- resource links
- theme/accent/provider code
- browser history or navigation code
- app layout code
