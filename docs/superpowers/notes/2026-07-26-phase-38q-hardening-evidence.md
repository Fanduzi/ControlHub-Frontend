# Phase 38Q Disclosure Hardening — Evidence

> This evidence note records verified acceptance snapshots.
> It does not self-verify; final pushed SHA and CI status are
> confirmed by an independent external verifier after push.

## Code Acceptance Snapshots

- Backend base: `9de01f6` (Phase 38Q original implementation)
- Frontend base: `ae3734b` (Phase 38Q original implementation)
- Backend code acceptance SHA: recorded after corrective branch merge
- Frontend code acceptance SHA: recorded after corrective branch merge

## P1 Fix: Metadata Disclosure Bypass (2026-07-26)

**Problem**: Non-SELECT queries (SHOW, DESCRIBE) produced empty projection
plans. Backend `Apply()` passed through columns with Go zero-value
`displayMode: ""`. Frontend added `""` to `ResultDisclosureMode` and
bypassed all validation for empty mode. This violated the locked three-state
contract (`raw_copy_allowed | masked_no_copy | blocked`) and fail-closed
design.

**Fix**:
- Backend: `Preflight()` now returns `ErrQueryDisclosureBlocked` when
  `len(projection.Columns) == 0`. `Apply()` defensively rejects empty plans.
- Frontend: Removed `| ""` from `ResultDisclosureMode`. Removed empty-mode
  bypass in `normalizeExecuteResponse`. Empty displayMode now triggers
  "unknown disclosure mode" error.
- Regression tests: backend (SHOW TABLES, DESCRIBE, etc. blocked; SELECT 1
  still allowed), frontend (empty displayMode rejected, raw value not in DOM).

**Locked decision**: All results without per-column valid disclosure decisions
are blocked before execution. No fourth display mode. Metadata query support
is a future non-goal requiring separate spec.

## Review Artifacts

### Pre-repair Oracle Reviews (blocking findings)
- Backend: `2026-07-26-phase-38q-oracle-backend-review.md`
  - Scope: `f0c6d81...9de01f6`
  - Verdict: P1=1, P2=1 — Merge blocked
- Frontend: `2026-07-26-phase-38q-oracle-frontend-review.md`
  - Scope: `7a7f6fb...ae3734b`
  - Verdict: P1=2, P2=1 — Merge blocked

### Post-repair Oracle Reviews
- Backend: `2026-07-26-phase-38q-hardening-oracle-review.md`
  - Scope: `9de01f6...<backend-candidate-head>`
  - Verdict: to be recorded after final review
- Frontend: `2026-07-26-phase-38q-hardening-oracle-frontend-review.md`
  - Scope: `ae3734b...<frontend-candidate-head>`
  - Verdict: to be recorded after final review

### Momus Review
- Plan: Phase 38Q hardening plan
- Initial verdict: REJECT (2 blocking issues)
- Final verdict: to be re-executed and recorded

## Backend Gates (to be recorded at candidate SHA)

| Gate | Command | Result |
|------|---------|--------|
| Format | `gofmt -d $(git diff --name-only 9de01f6...HEAD -- '*.go')` | |
| Vet | `go vet ./...` | |
| Build | `go build ./...` | |
| Unit | `go test -count=1 ./...` | |
| OpenAPI | `make openapi-validate` | |
| Whitespace | `git diff --check 9de01f6...HEAD` | |

## Frontend Gates (to be recorded at candidate SHA)

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npx tsc --noEmit -p tsconfig.json` | |
| Lint | `npm run lint` | |
| Unit | `npm run test` | |
| Build | `npm run build` | |
| E2E preflight | `npm run check:e2e-preflight` | |
| E2E governance | `npm run check:e2e-governance` | |
| Whitespace | `git diff --check ae3734b...HEAD` | |

## E2E Runs (to be recorded at merged-root SHA)

- Backend CWD: `/Users/fan/GolangProjects/ControlHub`
- Frontend CWD: `/Users/fan/JsProjects/ControlHub`
- Command: `npm run test:e2e -- e2e/query-workbench.spec.ts e2e/query-credential-settings.spec.ts`

| Run | Total | Passed | Failed | Skipped | Result |
|-----|-------|--------|--------|---------|--------|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

## Backend Corrective Recovery

- WIP removal commit: restores `.gitignore` and `advisor-plans/README.md`
  to pre-`4e55375` state. Momus artifact preserved.
- `790c0c9` revert: removes broad gofmt scope drift (12 unrelated files).
- User WIP restored to unstaged working tree after merge/push.

## Finalization Status

Merged; acceptance snapshot recorded. Finalization status is external —
final pushed SHA, CI URL, and required job conclusion are verified by
independent read-only verifier after push.
