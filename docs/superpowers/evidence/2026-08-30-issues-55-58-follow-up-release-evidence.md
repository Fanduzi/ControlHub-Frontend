# 2026-08-30 Issues 55-58 Follow-up Release Evidence

Date: 2026-08-30

## Scope

Frontend issues `#55`-`#58` cover explicit all-environment selection, readable
localized Overview attention reasons, resource-less login audit presentation,
and persisted audit environment scope. The delivery also coordinates the
backend audit actor projection required by `#57`.

## Refs

| Item | Value |
|------|-------|
| Frontend repository | `Fanduzi/ControlHub-Frontend` |
| Frontend base and prior `origin/main` | `532575e933c5c8bb8731fdf2499959ed98b11074` |
| Frontend implementation and pushed `main` SHA | `99787a9001a73c8dbee55d9a5d634414d2eeb1d4` |
| Frontend push | Normal fast-forward `532575e..99787a9`; no force push |
| Frontend implementation CI | [33304740887](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33304740887) — successful |
| Required frontend jobs | `release-local` (`99239161228`) and `release-e2e` (`99239161337`) — successful |
| E2E artifact | [`frontend-cross-repo-e2e-artifacts`](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/33304740887/artifacts/9730231037) |
| Backend product SHA used by E2E | `12d3907d96307f8eb9def0ea14a45c20c37a507d` |
| Backend final delivery SHA | `c47d7b278273a20e892f668a7f5e51a05c164abf` |
| Backend final CI | [33304776797](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/33304776797) — successful |
| Candidate worktree | `/Users/fan/JsProjects/ControlHub-wt-integration` |

## Verification

- Red loop: six new regression assertions failed before implementation while
  55 existing targeted tests passed.
- Focused regression suite — 6 files and 69 tests passed.
- `CONTROLHUB_BACKEND_DIR=/var/folders/f1/vlfk2v8112qgypfdl_s75bz00000gn/T/tmp.Pd6VTrXYiR/backend npm run release:local`
  — passed: runtime/preflight/governance/contract checks, TypeScript, ESLint,
  123 test files with 1869 tests, and the production build.
- CI cross-repository Playwright — 183 passed, 0 failed, 0 skipped, using one
  worker against backend `12d3907d96307f8eb9def0ea14a45c20c37a507d`.
- Three-level documentation checker, staged mode — passed.
- Read-only specification/standards review — PASS, P1=0, P2=0.

The CI local gate reported four existing unused-variable warnings in unrelated
test files. The changed files produced no TypeScript or ESLint errors and added
no warning. No test, browser guard, or E2E case was skipped or weakened.

## Preservation

The dirty frontend root worktree was not used for implementation. Its existing
modified `AGENTS.md` and `CLAUDE.md`, two backup files, and two screenshot files
were preserved. The dirty backend root worktree and its existing modified and
untracked files were also preserved. No reset, clean, stash, rebase, worktree
removal, or unrelated-file edit was performed.
