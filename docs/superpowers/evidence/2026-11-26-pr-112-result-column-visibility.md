# Worksheet result column visibility: PR 112

[Frontend PR 112](https://github.com/Fanduzi/ControlHub-Frontend/pull/112) delivers [#174](https://github.com/Fanduzi/ControlHub-Backend/issues/174), the temporary column visibility slice of roadmap item 26. The primary worksheet grid can hide and restore columns locally, retains at least one visible column, distinguishes duplicate names, skips hidden columns when navigating, and resets on a new delivery. Visibility changes clear selection; hiding clears only that column's sort/filter. Copy refuses a range crossing a hidden column, and FK navigation refuses hidden key columns. CSV/JSON eligibility and serialization use the full delivered page and flags. The related grid and backend contract are unchanged.

## Verified refs

| Ref | SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `1076fed46dbbd5fcf0f0cb83cbc10b2752b256ee` |
| Reviewed candidate and isolated fast-forward product commit | `c93a49fb1fd6de8215474eca675bd25b6126ac72` |
| Product tree | `318ab2fd840eb5fbdabafb3e633be48d6f6c118a` |
| PR CI merge checkout, same product tree | `19918b01361ff7fa2c5bbe855e01ce549d10583c` |
| Unchanged backend `origin/main` and E2E pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only c93a49fb1fd6de8215474eca675bd25b6126ac72` advanced the isolated delivery tree from the base. The normal `git push origin HEAD:refs/heads/main` range starts at that base and ends at the documentation-only commit carrying this file.

## Review and gates

- Independent Pi `reviewer` Standards and Spec final verdicts **OK**, P1 **0**, P2 **0**. The first review flagged hidden FK navigation, missing sort-reset coverage, and aggregate build evidence that was still being produced. The revised candidate passed both review axes, including the FK hide/restore and independent sort/filter reset regressions. The FK regression reproduced before the fix. The original targeted grid/range/page-view run passed 263 tests; both amended component regressions passed and were run again in the full suite. `git diff --check` and `check_three_level_doc.sh --staged` passed; four L2 module docs updated, no L1 architecture change.
- Node 22.22.0; `npm ci` and `CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed at the final candidate in `/private/tmp/controlhub-174.G0cw5o/frontend`: 143 Vitest files / 2,226 tests, TypeScript, governance, contract checks and Next build; the existing `audit-table.tsx` lint warning only.
- The isolated fast-forward checkout `/private/tmp/controlhub-174.G0cw5o/main` used `npm ci` and the same `release:local` command. An initial run on a heavily loaded host failed five tests in unchanged components; `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` reran the entire gate and passed 143 files / 2,226 tests and Next build. No assertions, tests or timeouts changed; the ESLint warning was unchanged.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed in both candidate and fast-forward checkouts: **18 Chromium tests passed, 0 failed, 0 skipped** each. Next `:3100` and proxy `:8081` CWDs were the respective checkout at the product SHA. `/e2e/assembly` verified `c171-delivery` and the backend pin on `:18082` (PID 10243; CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`). The 230-case suite runs in CI only because an unchanged PG spec expects the protected `:8080` locally.
- [PR CI 45847909153](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45847909153) passed `release-local` (140006287986; 143 files, 2,226 tests and build) and `release-e2e` (140006287208; paired engine checks and `npm run release:e2e`, **230 Chromium tests passed, 0 failed, 0 skipped**). It served the merge tree and pinned backend above with a disposable CI fixture on `:8080`. [Sanitized E2E artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45847909153/artifacts/15133976844).

## Preservation

Frontend root stayed clean at `1adb2552a8514946fb6b4f691411dab9b79efadd`. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` kept its 23 start-of-delivery porcelain entries (one modified advisor README and 22 untracked entries, including the harness goal directory); exact allowlist snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. Backend unchanged and not pushed. `:8080` PID 69999 and fixture `:18082` PID 10243 remained running. Playwright removed only its own Next and proxy listeners. Isolated checkouts and the PR branch were retained for verification.
