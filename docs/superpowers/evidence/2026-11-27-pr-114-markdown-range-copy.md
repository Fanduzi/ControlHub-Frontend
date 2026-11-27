# Worksheet Markdown range copy: PR 114

[Frontend PR 114](https://github.com/Fanduzi/ControlHub-Frontend/pull/114) delivers [#176](https://github.com/Fanduzi/ControlHub-Backend/issues/176), a slice of roadmap item 25. The primary worksheet grid can copy an eligible multi-cell rectangle as GFM. Numbered structural headers are not source column names; cell values are literal code spans with preserved line breaks. Existing TSV and Ctrl/Cmd+C are unchanged. The shared copy gate refuses hidden crossings, noncopyable columns, truncated or unavailable cells. Related grids, full-page CSV/JSON and the backend are unchanged.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `4dcfd00b74f596105f5b4b9711a69943d4dfe946` |
| Reviewed product and isolated fast-forward result | `f4d90560c3d6643bee3c3f9110a09ab874d58c30` |
| Product tree | `2b7311fb6061712cda11520b8655e3f3c9769f6b` |
| PR merge checkout, same tree | `0066a294b0c63f3e6c7bfc9b7286412a68ccfaf5` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only f4d90560c3d6643bee3c3f9110a09ab874d58c30` advanced the isolated delivery tree from the base. The normal `git push origin HEAD:refs/heads/main` range ends at the documentation-only commit carrying this record.

## Verification

- Independent Pi Standards and Spec reviews flagged bare GFM autolinks and inconsistent TSV/Markdown documentation. The final re-review **OK**, P1 **0**, P2 **0** after using code spans, adding tests, and separating documentation. GitHub's GFM renderer verified representative URL/email literals did not become links when wrapped in code spans. Unit regressions failed before implementation; final `npm exec -- vitest run tests/lib/query-result-range.test.ts` passed 18. Staged L2 and `git diff --check` passed; no L1 architecture change.
- At Node 22.22.0, `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed in both candidate `/private/tmp/controlhub-markdown.rZwjme/frontend` and isolated fast-forward checkout `/private/tmp/controlhub-markdown.rZwjme/main`: 143 files / 2,230 tests, TypeScript, governance and contract gates, Next build. Existing `audit-table.tsx` lint warning only.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed in both checkouts: **20 passed, 0 failed, 0 skipped**. The real clipboard case verifies pipes, line breaks, empty and NULL cells, exact TSV via keyboard, and clipboard preservation for masked, truncated and hidden crossings. In the delivery run Next `:3100` and proxy `:8081` were in the delivery checkout at the product SHA. `/e2e/assembly` verified `c171-delivery` on `:18082` (PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`) and pinned backend. Full suite is CI-only since the unchanged PG guard expects protected local `:8080`.
- [PR CI 45913772232](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45913772232): `release-local` (140228005495) passed 143 files / 2,230 tests and Next build; `release-e2e` (140228005720) passed paired engine checks and `npm run release:e2e`: **232 Chromium tests passed, 0 failed, 0 skipped**. CI checked out the merge tree above and served pinned backend on disposable runner `:8080`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45913772232/artifacts/15161439378).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries (modified advisor README and 22 untracked entries including harness goals); exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push. `:8080` PID 69999 and `:18082` PID 10243 retained; Playwright removed only its own listeners. Product and delivery worktrees and PR branch retained for verification.
