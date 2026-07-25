# Phase 38Q Evidence: Governed Result Disclosure Policy

> This evidence note records verified results only. All claims below were
> proved from the exact merged roots and tracked files on 2026-07-25.

## SHAs

- Backend base: `f0c6d81` (Phase 38P runtime contract)
- Frontend base: `7a7f6fb` (Phase 38P FK navigation regression test)
- Backend merged: `9de01f6d5a54d2e8867d5a823118443ba5fac8c5`
- Frontend candidate: `ff8f4fedaef0681fc97d25c8bfb4a449cc8346d7`
- Frontend repair: `40e8a23` (test stability fix on top of `8ab782b`)
- Backend `origin/main`: `9de01f6d5a54d2e8867d5a823118443ba5fac8c5` (matches HEAD)
- Frontend `origin/main`: pending after repair push

## Merge and Push

- Merge type: fast-forward on both repos
- Backend push range: `f0c6d81..9de01f6` (11 commits)
- Frontend push range: `7a7f6fb..ff8f4fe` (7 commits)
- Frontend repair: `8ab782b..40e8a23` (1 commit: test stability fix)

## Backend Gates (SHA `9de01f6`)

| Gate | Command | Result |
|------|---------|--------|
| Whitespace | `git diff --check f0c6d81...HEAD` | PASS (no output) |
| Format | `gofmt -d $(git diff --name-only f0c6d81...HEAD -- '*.go')` | PASS (no output) |
| Vet | `go vet ./...` | PASS |
| Build | `go build ./...` | PASS |
| Unit | `go test -count=1 ./...` | PASS (1117 passed in 10 packages) |
| OpenAPI | `make openapi-validate` | PASS (TestOpenAPIYAMLIsValid) |
| Integration | `make test-integration` | PASS |
| Fuzz | `make test-openapi-fuzz` | PASS (TestOpenAPIFuzz) |

## Frontend Gates (SHA `40e8a23`)

| Gate | Command | Result |
|------|---------|--------|
| Whitespace | `git diff --check 8ab782b...HEAD` | PASS (no output) |
| E2E preflight | `npm run check:e2e-preflight` | PASS (ports 3100, 8081 free) |
| E2E governance | `npm run check:e2e-governance` | PASS (13 spec files scanned) |
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | PASS (no errors) |
| Lint | `npm run lint` | PASS (0 errors, 5 warnings) |
| Unit | `npm run test` | PASS (1206 passed, 0 failed, 3 consecutive runs) |
| Build | `npm run build` | PASS (Next.js 16.2.3 Turbopack) |

## Test Stability Evidence

Flaky test: `tests/components/query-relationship-map.test.tsx`

Root cause: Tests used `screen.getAllByText("Outbound")` which throws immediately
if element not found, but edge items render asynchronously after the "Back to details"
button becomes visible.

Fix: Changed to `await screen.findAllByText("Outbound")` which waits for async render.

Baseline characterization (10 runs each, full suite):
- Baseline `7a7f6fb`: 6 pass, 4 fail
- Pre-repair `8ab782b`: 6 pass, 4 fail
- Post-repair `40e8a23`: 10 pass, 0 fail

Focused test stability (20 consecutive runs):
- Post-repair `40e8a23`: 20 pass, 0 fail

Full suite stability (3 consecutive runs):
- Post-repair `40e8a23`: 3 pass, 0 fail (1206 tests each)

## E2E Runs (SHA `40e8a23`)

All runs executed against merged-root services:
- Backend: `go run ./cmd/server` from `/Users/fan/GolangProjects/ControlHub` at SHA `9de01f6`
- Frontend: `bash e2e/harness/dev-server-wrapper.sh -p 3100` from `/tmp/phase38q-fix` at SHA `40e8a23`
- MySQL fixture: `controlhub-query-e2e-mysql` on `127.0.0.1:13306`
- Command: `npx playwright test e2e/query-workbench.spec.ts e2e/query-credential-settings.spec.ts`

| Run | Total | Passed | Failed | Skipped | Duration | Result |
|-----|-------|--------|--------|---------|----------|--------|
| 1 | 80 | 80 | 0 | 0 | 135323ms | PASS |
| 2 | 80 | 80 | 0 | 0 | 134304ms | PASS |
| 3 | 80 | 80 | 0 | 0 | 129588ms | PASS |

## Independent Review

- Oracle adversarial review: P1 findings addressed in backend commit `0c00213` (admin role check, utf8mb4_bin collation, plan/result column count mismatch rejection)
- Oracle review: P1 findings addressed in frontend commit `68ad559` (pane width default, related-record panel normalization, hydration lint)
- Momus: no stored review artifact found; not available
- Oracle final verdict artifact: no stored artifact found; P1 findings addressed per commit messages
- Diff review: pending (Phase 4)

## CI Verification

- Backend CI: [Run 30149433566](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/30149433566)
  - Required job `release-local-gates`: success
  - Job `release-docker-gates`: skipped (not required on main push)
  - Conclusion: success
- Frontend CI: pending after repair push

## Literal-Only No-FROM Exemption

The 38Q implementation exempts literal-only no-FROM SELECTs from governed
disclosure policy. This behavior was confirmed in:
- Backend commit `c00a94b`: `feat(query): exempt literal-only no-FROM SELECTs as raw_copy_allowed`
- Backend commit `912710f`: `fix(query): reject WHERE/HAVING/CTEs/GROUP BY/ORDER BY/LIMIT in literal SELECT`
- Backend commit `9de01f6`: `test(query): add CTE with literal outer test case`

The exemption applies only to pure literal expressions (e.g., `SELECT 1, 'hello'`)
with no FROM clause, no subqueries, and no complex clauses. This is a deliberate
policy choice documented in the spec.

## Preservation Evidence

- Backend WIP: `.gitignore` and `advisor-plans/README.md` verified unstaged (byte-for-byte preserved)
- Frontend `wip/query-runtime-fixes-2026-07-20`: preserved (not touched)
- Rescue branches: `rescue/phase-38q-backend-0c00213`, `rescue/phase-38q-frontend-4544d35` (not touched)
- Backend worktrees: `phase-38h-query-target-pagination`, `phase-38m-empty-result-contract`, `phase-38p-runtime-contract`, `phase-38n-docs-closure` (not touched)
- Frontend worktrees: `phase-38p-workbench-reliability`, `phase-38h-query-workbench-scalable-ia-reset` (not touched)
- Frontend `phase-38q-ui` worktree at `/Users/fan/JsProjects/ControlHub-worktrees/phase-38q-ui` (not touched)
- Existing services, fixtures, containers: preserved

## Known Non-Goals

- No general export/bulk-download capability
- No sensitivity inference from column names (email, phone, token)
- No UI-only masking without backend disclosure decision
- No FROM-less SELECT complex clause support (WHERE, HAVING, CTEs, etc.)

## Pre-Existing Issues

- Frontend lint warnings: 5 unused eslint-disable/no-unused-vars warnings (not errors)
- All unit and E2E tests pass with zero failures after repair
