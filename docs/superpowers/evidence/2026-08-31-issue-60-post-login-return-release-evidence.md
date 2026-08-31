# 2026-08-31 Issue 60 Post-login Return Release Evidence

Date: 2026-08-31

## Scope

Frontend issue `#60` preserves the protected path and query when an invalid or
expired session redirects to login. Successful login returns to that target
only when browser URL parsing confirms it is same-origin; unsafe or malformed
targets fall back to `/overview`.

## Refs

| Item | Value |
|------|-------|
| Frontend repository | `Fanduzi/ControlHub-Frontend` |
| Frontend base and prior `origin/main` | `fd2785dbe925803aed0afbccec1bde914cb48663` |
| Frontend implementation and pushed `main` SHA | `50f8c09326f6e02331f3d4be5878013914c6a41d` |
| Frontend push | Normal fast-forward `fd2785d..50f8c09`; no force push |
| Frontend implementation CI | [33345811687](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33345811687) — successful |
| Required frontend jobs | `release-local` (`99349591966`) and `release-e2e` (`99349592104`) — successful |
| E2E artifact | [`frontend-cross-repo-e2e-artifacts`](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33345811687/artifacts/9742159731) |
| Backend SHA used by E2E | `c47d7b278273a20e892f668a7f5e51a05c164abf` |
| Candidate worktree | `/Users/fan/JsProjects/ControlHub-wt-integration` |

## Verification

- Red loop: two consecutive focused runs failed because the proxy produced
  `/audits` instead of `/audits?environment=staging` and successful login pushed
  `/overview` instead of the protected target.
- Focused regression suite — 2 files and 19 tests passed, including same-origin,
  protocol-relative, backslash, external, and malformed return targets.
- `CONTROLHUB_BACKEND_DIR=/var/folders/f1/vlfk2v8112qgypfdl_s75bz00000gn/T/tmp.Pd6VTrXYiR/backend npm run release:local`
  — passed: runtime/preflight/governance/contract checks, TypeScript, ESLint,
  123 test files with 1876 tests, and the production build.
- CI cross-repository Playwright — 183 passed, 0 failed, 0 skipped, using one
  worker against backend `c47d7b278273a20e892f668a7f5e51a05c164abf`.
- Read-only specification and standards diff review — PASS, P1=0, P2=0.
- L3 headers and the root, login, and app-test README updates passed mechanical
  checks. The stock three-level-doc script reported its known root normalization
  false positive: it compared Git's `README.md` key with `./README.md`; no
  documentation file was missing or stale.

The CI local gate reported four existing unused-variable warnings in unrelated
test files. The changed files produced no TypeScript or ESLint errors and added
no warning. No test, browser guard, or E2E case was skipped or weakened.

## Preservation

The dirty frontend root worktree was not used for implementation. Its existing
modified `AGENTS.md` and `CLAUDE.md`, two backup files, and two screenshot files
were preserved. The dirty backend root worktree and its existing modified and
untracked files were also preserved. No reset, clean, stash, rebase, worktree
removal, or unrelated-file edit was performed.
