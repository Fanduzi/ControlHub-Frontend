# Phase 38Q Disclosure Hardening - Evidence

> This evidence note records verified results only. All claims below were
> proved from the exact merged roots and tracked files on 2026-07-26.

## SHAs

- Backend base: `9de01f6` (Phase 38Q original implementation)
- Frontend base: `ae3734b` (Phase 38Q original implementation)
- Backend merged: `1fa5287` (gofmt fix)
- Frontend merged: `eb8cc11` (final evidence update)
- Backend `origin/main`: `1fa5287` (matches HEAD)
- Frontend `origin/main`: `eb8cc11` (matches HEAD)

## Merge and Push

- Merge type: fast-forward on both repos
- Backend push range: `9de01f6..1fa5287` (5 commits)
- Frontend push range: `ae3734b..eb8cc11` (14 commits)
- Note: Frontend E2E runs were executed on SHA `b11d261`; subsequent commits are documentation-only changes that do not affect code behavior.

## Backend Gates (SHA `4e55375`)

| Gate | Command | Result |
|------|---------|--------|
| Format | `gofmt -d $(git diff --name-only 9de01f6...HEAD -- '*.go')` | PASS (no output) |
| Vet | `go vet ./...` | PASS |
| Build | `go build ./...` | PASS |
| Unit | `go test -count=1 ./...` | PASS (1,130 passed in 10 packages) |

## Frontend Gates (SHA `e04ded8`)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | PASS (no errors) |
| Lint | `npm run lint` | PASS (0 errors, 5 warnings unrelated) |
| Unit | `npm run test` | PASS (1,214 tests passed) |
| Build | `npm run build` | PASS (Next.js 16.2.3 Turbopack) |

## E2E Runs (SHA `b11d261`)

All runs executed against merged-root services:
- Backend: `go run ./cmd/server` from `/Users/fan/GolangProjects/ControlHub` at SHA `1fa5287`
- Frontend: `bash e2e/harness/dev-server-wrapper.sh -p 3100` from `/Users/fan/JsProjects/ControlHub` at SHA `b11d261`
- MySQL fixture: `controlhub-query-e2e-mysql` on `127.0.0.1:13306`
- Command: `npx playwright test e2e/query-workbench.spec.ts e2e/query-credential-settings.spec.ts`
- Note: Subsequent commits are documentation-only; E2E results remain valid for final SHA `eb8cc11`.

| Run | Total | Passed | Failed | Skipped | Duration | Result |
|-----|-------|--------|--------|---------|----------|--------|
| 1 | 80 | 80 | 0 | 0 | 2.3m | PASS |
| 2 | 80 | 80 | 0 | 0 | 2.3m | PASS |
| 3 | 80 | 80 | 0 | 0 | 2.4m | PASS |

## Review Artifacts

### Pre-repair Oracle Reviews (blocking findings)
- Backend: `2026-07-26-phase-38q-oracle-backend-review.md`
  - Scope: `f0c6d81...9de01f6`
  - Verdict: P1=1, P2=1 — Merge blocked
  - SHA-256: `1a011780484872135c27371c2104e05710151215c680b3028efd8ed852bee739`
- Frontend: `2026-07-26-phase-38q-oracle-frontend-review.md`
  - Scope: `7a7f6fb...ae3734b`
  - Verdict: P1=2, P2=1 — Merge blocked
  - SHA-256: `c5e3fe0c507d0385bb6418097998ffce0ed6e1b24512620198225561ff5abfc0`

### Post-repair Oracle Reviews (all findings addressed)
- Backend: `2026-07-26-phase-38q-hardening-oracle-review.md`
  - Scope: `9de01f6...9f4e33f`
  - Verdict: PASS
- Frontend: `2026-07-26-phase-38q-hardening-oracle-review.md`
  - Scope: `ae3734b...9d3bebf`
  - Verdict: PASS

### Momus Plan Review
- `2026-07-26-phase-38q-hardening-momus-review.md`
  - Plan: `.omo/plans/2026-07-26-phase-38q-disclosure-hardening-execution.md`
  - Verdict: REJECT (2 blocking issues, both resolved)

## CI Verification

- Backend CI: Run `30195441967` — status: ok (on final SHA `1fa5287`)
- Frontend CI: Run `30195815565` — status: ok (on final SHA `eb8cc11`)

## Root State Verification

- Backend HEAD = origin/main = `1fa5287`
- Frontend HEAD = origin/main = `eb8cc11`
- Backend: clean (only `.gitignore` and `advisor-plans/README.md` allowed user WIP)
- Frontend: clean

## Changes Implemented

### Backend
1. Fixed `isNoTableProjection` to distinguish parser-synthesized dual from explicit dual
2. Added `stripSQLComments` function to handle SQL comments in explicit dual detection
3. Added mode validation in `buildDisclosurePlan` to reject invalid stored modes
4. Added defensive validation in `Apply` to validate each ColumnDisclosure before copying rows
5. Fixed `classifyExecutorError` to handle `ErrQueryDisclosureBlocked` (403 instead of 502)

### Frontend
1. Extended `normalizeExecuteResponse` to validate disclosure contracts
2. Added `MASKED_SENTINEL` validation for masked_no_copy columns
3. Added exact boolean check for `copyAllowed`
4. Updated `ExecuteErrorPanel` to not render raw server message for `query_result_disclosure_blocked`
5. Created `query-disclosure-policies` settings route
6. Updated `.gitignore` to unignore the settings route
7. Added empty string to `ResultDisclosureMode` type for metadata queries

## Independent Review

- Oracle adversarial review: P1/P2 findings addressed (see post-repair reviews)
- Momus plan review: REJECT (2 blocking issues, both resolved)
- Route tracking: `git ls-files --error-unmatch 'app/(console)/settings/query-disclosure-policies/page.tsx'` returns exit 0
- Diff review: only test file, evidence doc, and type fix changed; no product behavior change
