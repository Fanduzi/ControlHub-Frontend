# Worksheet Explain summary: PR 115

[Frontend PR 115](https://github.com/Fanduzi/ControlHub-Frontend/pull/115) delivers [#177](https://github.com/Fanduzi/ControlHub-Backend/issues/177), the node summary slice of roadmap item 32. MySQL and PostgreSQL can display the complete normalized plan in delivery order with operation, relation, index, estimated rows, and separate startup/total costs. Unreported values are labeled, and costs are identified as engine-local estimates. Cards, branch state, text, risks, close focus, and the ClickHouse interface are unchanged. No backend or disclosure changes.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `e97f7db896e6b329e972ff6036db409d5459cb0b` |
| Reviewed product and isolated fast-forward result | `a0d17bd27a2a57b200b2ff532793e8c51181d165` |
| Product tree | `a7e4153e8609609628d294f1ddb0e2e28fc71e74` |
| PR CI merge checkout, same tree | `f7d7832eee9e66f659e493a180743576fd77022e` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only a0d17bd27a2a57b200b2ff532793e8c51181d165` advanced the isolated delivery checkout from the base. The normal `git push origin HEAD:refs/heads/main` range ends at the documentation-only commit carrying this file.

## Verification

- Independent Pi `reviewer` Standards and Spec verdicts **OK**, P1 **0**, P2 **0**. The new component check was red before implementation and passed afterwards; `npm exec -- vitest run tests/components/query-workbench.test.tsx -t 'QueryWorkbench Explain'` passed 16 selected tests. It verifies zero versus absent values, delivery order, risks, branch state, Escape and focus. Staged `check_three_level_doc.sh --staged` and `git diff --check` passed; three L2 docs updated, no L1 architecture change.
- Node 22.22.0, `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed on candidate `/private/tmp/controlhub-plan-table.mlEMpK/frontend` and fast-forward checkout `/private/tmp/controlhub-plan-table.mlEMpK/main`: 143 files / 2,231 tests, TypeScript, governance, contract and Next build. Existing `audit-table.tsx` lint warning only.
- `npm run test:e2e -- e2e/query-workbench.spec.ts e2e/explain-summary-local-probe.spec.ts -g 'Explain shows normalized risk|PostgreSQL Explain renders bounded nodes'` passed **2, failed 0, skipped 0** in the fast-forward checkout, after the same cases passed on the candidate. MySQL checked omitted costs, risk and close focus; PostgreSQL compared each summary row to the real normalized response and checked original views. The temporary PG probe used the committed assertions in the existing port-aware harness and was removed after testing. The full PG suite keeps its fixed `:8080` check and runs in CI. Next `:3100` and proxy `:8081` CWDs were the delivery checkout at the product SHA. `/e2e/assembly` verified `c171-delivery` and pinned backend on `:18082`, PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`.
- [PR CI 45918893127](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45918893127): `release-local` (140244595127), 143 files / 2,231 tests and build; `release-e2e` (140244594819), paired engines and `npm run release:e2e`, **232 Chromium passed, 0 failed, 0 skipped**. CI used the matching merge tree and pinned backend on disposable runner `:8080`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45918893127/artifacts/15164462241).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained its 23 porcelain entries (modified advisor README and 22 untracked entries including goal data); exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push. `:8080` PID 69999 and `:18082` PID 10243 retained; Playwright removed only its own listeners. Product and delivery worktrees and PR branch retained for verification.
