# Wide worksheet result reading: PR 113

[Frontend PR 113](https://github.com/Fanduzi/ControlHub-Frontend/pull/113) delivers [#175](https://github.com/Fanduzi/ControlHub-Backend/issues/175), part of roadmap items 26 and 54. The primary worksheet grid freezes the first visible column on demand (off by default), follows visibility, and resets on paging or Run. The visibility picker has case-insensitive column-name search and distinct duplicate labels. No requests, backend or disclosure changes. Related grids, selection copy and full delivered page exports retain their existing contracts.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `58e3744469873894e36fcdbab69215a2e7e9e430` |
| Reviewed product and isolated fast-forward result | `a60ebb9be0f4204aadbe33646340f34894a85897` |
| Product tree | `338d107ce46e406ea60b50bf3204d9592f1accde` |
| PR merge checkout, same tree | `f7a85eecda52bf6944da40b75c6ec8fa520bb6eb` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only a60ebb9be0f4204aadbe33646340f34894a85897` advanced the isolated delivery tree from the base. The normal `git push origin HEAD:refs/heads/main` range ends at the documentation-only commit carrying this record.

## Verification

- Independent Pi Standards review **OK**. Spec flagged minimum width in an exceptionally narrow scrollport; browser test reproduced 44px instead of 104px. The final re-review **OK**, P1 **0**, P2 **0** after the width floor and browser regression. Component regression was red before implementation and green afterwards; covers duplicate names, search isolation, freeze default, handoff and off toggle.
- Staged `check_three_level_doc.sh --staged` and `git diff --check` passed; module docs updated, no architecture map change. At Node 22.22.0, `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed separately at the exact product in `/private/tmp/controlhub-wide.KqGYWJ/frontend` and isolated delivery checkout `/private/tmp/controlhub-wide.KqGYWJ/main`: 143 files / 2,227 tests, TypeScript, governance and contract checks, Next production build. The existing `audit-table.tsx` lint warning remained.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts`: **19 passed, 0 failed, 0 skipped** on candidate and fast-forward trees. In the delivery run, `:3100` Next and `:8081` proxy had the delivery checkout CWD at the product SHA. `/e2e/assembly` verified `c171-delivery` and the backend pin on `:18082` (PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`). Verified real scroll and keyboard focus with a resized frozen lead, width floor, search, visibility handoff, paging/Run reset and unchanged CSV/JSON. Full suite is CI-only since the unchanged PG guard expects protected local `:8080`.
- [PR CI 45907950949](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45907950949): `release-local` (140209136282), 143 files / 2,227 and build; `release-e2e` (140209136123), paired engines and `npm run release:e2e`, **231 Chromium passed, 0 failed, 0 skipped**. CI checked out the merge tree above and served pinned backend on disposable runner `:8080`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45907950949/artifacts/15160005380).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` unchanged with 23 starting porcelain entries (modified advisor README, 22 untracked entries including harness goals); snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push. `:8080` PID 69999 and `:18082` PID 10243 retained, Playwright removed only its own listeners. Product and delivery worktrees and PR branch retained for verification.
