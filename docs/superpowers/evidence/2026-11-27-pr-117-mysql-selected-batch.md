# MySQL worksheet selected batch: PR 117

[Frontend PR 117](https://github.com/Fanduzi/ControlHub-Frontend/pull/117) delivers [#178](https://github.com/Fanduzi/ControlHub-Backend/issues/178), the MySQL-only slice of roadmap item 12. The distinct batch action accepts one bounded selection of 2–5 complete statements, sends one ordinary governed Execute request at a time, and keeps each valid delivered first page in a result tab. First failure or cancellation stops later submissions; already delivered results remain. Context changes invalidate ownership. MySQL cancellation does not establish remote terminal state. Ordinary Run, disclosure, per-statement audit, and current-page CSV/JSON contracts are unchanged. No server batch API, other engine, or in-batch paging.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `209832fe4888be31dfdd65ed2f38b1db47a7ec53` |
| Reviewed product and isolated fast-forward result | `e6a34fcb89c14257f5f921900d63f39641bb8bc1` |
| Product tree | `ef1d82301a2abbe66204907159d6d50f010500dd` |
| PR merge checkout, same tree | `f270ba69f449cd48b863a1439d0b6fa25827422e` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only e6a34fcb89c14257f5f921900d63f39641bb8bc1` advanced the isolated delivery checkout from the base. The normal `git push origin HEAD:refs/heads/main` range ends at the evidence-only commit carrying this file.

## Verification

- Independent Pi Standards review **OK**. Spec identified a stale batch history refresh after retarget; history now refreshes only when the original batch identity still owns the worksheet. Independent re-review **OK**, P1 **0**, P2 **0**. Three existing test locators were narrowed to the exact ordinary Run accessible name without changing their assertions. Staged L2 document checks and `git diff --check` passed; no L1 architecture change. `npm exec -- vitest run tests/lib/worksheet-session.test.ts tests/lib/sql-run-scope.test.ts` passed 120 tests, including refusal, cancellation, same-worksheet retarget and late-response ownership.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed in the candidate `/private/tmp/controlhub-mysql-batch.MdNUwp/frontend` and the isolated fast-forward checkout `/private/tmp/controlhub-mysql-batch.MdNUwp/main`: 143 files / 2,250 tests, TypeScript, governance and contract checks, Next build. Existing `audit-table.tsx` lint warning only.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed **25, failed 0, skipped 0** in the isolated delivery checkout. Real MySQL cases verify three ordered results and history records, exact eligible CSV/JSON and denied masked downloads, a real backend refusal and browser cancellation while the second request is held by the disposable fixture lock; neither failure nor cancellation sends the third statement. Next `:3100` and proxy `:8081` had the delivery checkout CWD at the reviewed product. `/e2e/assembly` verified `c171-delivery` on `:18082`, PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`. Full suite runs in CI; unchanged PG fixture guard expects locally protected `:8080`.
- [PR CI 45990505745](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45990505745): `release-local` (140476815523), 143 files / 2,250 tests and build; `release-e2e` (140476815833), cross-engine gates and `npm run release:e2e`, **237 Chromium passed, 0 failed, 0 skipped**. CI used matching frontend merge tree and pinned backend on disposable runner `:8080`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45990505745/artifacts/15194836455).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push or code change. `:8080` PID 69999 and `:18082` PID 10243 retained; Playwright removed only its own listeners. Product and delivery worktrees and PR branch retained for verification.
