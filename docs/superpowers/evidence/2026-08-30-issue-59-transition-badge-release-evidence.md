# 2026-08-30 Issue 59 Transition Badge Release Evidence

Date: 2026-08-30

## Scope

Frontend issue `#59` removes the normal `unknown` health badge while a resource
is provisioning or decommissioning. Warning and critical health remain visible,
and a running resource with unknown health is unchanged.

## Refs

| Item | Value |
|------|-------|
| Frontend repository | `Fanduzi/ControlHub-Frontend` |
| Frontend base and prior `origin/main` | `4a73fd00fd8596a1087fc178e5f38a18d527eaea` |
| Frontend implementation and pushed `main` SHA | `c34f617106d38f1ce32fd8c94187305a847dafe4` |
| Frontend push | Normal fast-forward `4a73fd0..c34f617`; no force push |
| Frontend implementation CI | [33318755763](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33318755763) — successful |
| Required frontend jobs | `release-local` (`99276868919`) and `release-e2e` (`99276869029`) — successful |
| E2E artifact | [`frontend-cross-repo-e2e-artifacts`](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33318755763/artifacts/9734441542) |
| Backend SHA used by E2E | `c47d7b278273a20e892f668a7f5e51a05c164abf` |
| Candidate worktree | `/Users/fan/JsProjects/ControlHub-wt-integration` |

## Verification

- Red loop: the focused provisioning fixture failed because it rendered the
  `unknown` health badge next to the lifecycle badge.
- Focused regression suite — 13 tests passed.
- `CONTROLHUB_BACKEND_DIR=/var/folders/f1/vlfk2v8112qgypfdl_s75bz00000gn/T/tmp.Pd6VTrXYiR/backend npm run release:local`
  — passed: runtime/preflight/governance/contract checks, TypeScript, ESLint,
  123 test files with 1870 tests, and the production build.
- CI cross-repository Playwright — 183 passed, 0 failed, 0 skipped, using one
  worker against backend `c47d7b278273a20e892f668a7f5e51a05c164abf`.
- Three-level documentation checker, staged mode — passed.
- Read-only specification and standards diff review — PASS, P1=0, P2=0.

The CI local gate reported four existing unused-variable warnings in unrelated
test files. The changed files produced no TypeScript or ESLint errors and added
no warning. No test, browser guard, or E2E case was skipped or weakened.

## Preservation

The dirty frontend root worktree was not used for implementation. Its existing
modified `AGENTS.md` and `CLAUDE.md`, two backup files, and two screenshot files
were preserved. The dirty backend root worktree and its existing modified and
untracked files were also preserved. No reset, clean, stash, rebase, worktree
removal, or unrelated-file edit was performed.
