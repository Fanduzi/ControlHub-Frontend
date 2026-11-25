# Worksheet current-page sort and filter: PR 110

[Frontend PR 110](https://github.com/Fanduzi/ControlHub-Frontend/pull/110) implements item 23 of the [open query-workbench roadmap](https://github.com/Fanduzi/ControlHub-Backend/issues/171). Sort and one-column text filtering affect only the displayed page, without sending SQL or a request; paging and a new Run reset both. Noncopyable columns are excluded and truncated cells are not compared or matched. CSV and JSON eligibility and payloads still use the whole delivered page in its original order. The related-record grid and backend are unchanged.

## Verified refs

| Ref | SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `ffe9615a610b7d1dceb05850b8c8c96ddfee9842` |
| Reviewed candidate and isolated fast-forward result | `b232e9cc55e9325e458e527e92f0f40c31f77e07` |
| Reviewed frontend product tree | `1aa1c6a2f4a6428c963d55165b698d2631ce2554` |
| PR CI merge checkout (same product tree) | `75fbf7ee1ecbb08fb126f6b3a64a2c010aa23a1f` |
| Unchanged backend `origin/main` and E2E pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Backend E2E tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only b232e9cc55e9325e458e527e92f0f40c31f77e07` advanced the isolated delivery checkout from the base above. The main delivery command is `git push origin HEAD:refs/heads/main`; its range begins at that base and ends at the documentation-only commit carrying this record.

## Review and local gates

- The Pi `reviewer` Standards and Spec lanes reviewed the complete PR diff. Initial findings: P1 ClickHouse unsigned integer strings compared lexically; P2 PostgreSQL NUMERIC special values caused finite values to fall back to text order. The independent re-review of the final candidate returned **OK** for both axes, P1 **0** / P2 **0**. It verified that export eligibility and downloads use delivered arrays, only the main grid opts in, and the truncation matrix moves with each row. English and simplified Chinese have the same 11 new result keys.
- `npm exec -- vitest run tests/lib/query-result-page-view.test.ts`: three new regressions failed before the sort fix; all 16 passed after it. `npm exec -- tsc --noEmit -p tsconfig.json`, `npm exec -- eslint lib/query-result-page-view.ts tests/lib/query-result-page-view.test.ts`, `git diff --check`, and `check_three_level_doc.sh --staged` passed. Five module READMEs changed; the L1 architecture map did not need an update.
- Node `22.22.0`; `npm ci` and `CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed separately at the exact candidate in `/private/tmp/controlhub-pr110.94mBsW/fix` and the same SHA after fast-forward in `/private/tmp/controlhub-pr110.94mBsW/main`: 143 Vitest files / 2,224 tests, TypeScript, preflight, governance and contract checks, and a Next production build. ESLint emitted the existing `react-hooks/incompatible-library` warning for `audit-table.tsx`, no errors.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed independently in both checkouts: **18 passed, 0 failed, 0 skipped** each. Listener CWDs for Next (`:3100`) and the proxy (`:8081`) were the corresponding checkout at the candidate above. Existing fixture `c171-delivery` (`:18082`, PID 10243) reported the pinned backend SHA in `/e2e/assembly`, verified before each run; Go build metadata independently reported that revision and `vcs.modified=false`. Fixture listener CWD: `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`. The full suite runs in CI only because an unchanged PG spec requires `:8080`, occupied locally by an unrelated process.

## Pull request CI

[Frontend CI 45633668753](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45633668753) succeeded on the reviewed candidate. `release-local` (139273286520) passed `npm ci`, dependency audit and `npm run release:local` with 143 files / 2,224 tests and a Next build. `release-e2e` (139273287177) passed the ClickHouse/Redis/MongoDB worksheet browser gate and `npm run release:e2e`: **230 Chromium tests passed, 0 failed, 0 skipped**. Both jobs used the GitHub Actions frontend merge checkout above and the pinned backend checkout; the browser gate used a disposable backend on `:8080` on its runner. [Sanitized E2E artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45633668753/artifacts/15033610769).

## Preservation at pre-push

The frontend root remained clean at `1adb2552a8514946fb6b4f691411dab9b79efadd`. The backend root remained at `0a1afa0b4bda194719d61388fa522c4a1f38cd96` with exactly the 22 pre-existing porcelain entries: `advisor-plans/README.md` plus 21 untracked entries. The exact whitelist is the byte-for-byte verified porcelain snapshot (SHA-256 `048bd702c95c3ed5c3673fef638b2438b1d7025dd692e59823a54715d9864cbf`). No backend change or push. The protected `:8080` listener (PID 69999) and `:18082` fixture listener were preserved. Playwright cleaned up only its own Next and proxy processes. Task worktrees and the PR branch were preserved through verification.
