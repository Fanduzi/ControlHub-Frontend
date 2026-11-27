# Worksheet batch acceptance follow-up: PR 116

[Frontend PR 116](https://github.com/Fanduzi/ControlHub-Frontend/pull/116) adds evidence for [#175](https://github.com/Fanduzi/ControlHub-Backend/issues/175) and [#176](https://github.com/Fanduzi/ControlHub-Backend/issues/176). It changes only disposable E2E fixture, tests and docs; product code, backend and disclosure contracts are unchanged.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `b92ac0f529dab720dd8b3e4295e61f15f0fda123` |
| Reviewed candidate and isolated fast-forward result | `33941ab1bf652358ccd03e54abf388760c6d4fec` |
| Candidate tree | `dcd6830627a5d687f05b9cba0e701a0923c7ea69` |
| PR merge checkout, same tree | `f08dbd594c347129334186860d0bb26651261d12` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only 33941ab1bf652358ccd03e54abf388760c6d4fec` advanced the isolated delivery checkout from the base. The normal `git push origin HEAD:refs/heads/main` range ends at the evidence-only commit carrying this record.

## Acceptance

- **Wide results:** the existing fixture seeder creates a real 12-column `t13_wide_orders` MySQL table with per-column disclosure. A governed worksheet `SELECT` at 1440px yields all 12 headers at default 160px width, with more than 200px of horizontal overflow before resizing. Chromium measures the frozen lead's position while the tail moves, then exercises keyboard resize, focus into the next column, case-insensitive picker search, hiding the lead, and freeze handoff. The earlier narrow-view and page/Run reset checks remain.
- **Markdown refusal:** two independent, labeled browser tests first copy a real eligible range into Chromium's clipboard. They then present an otherwise typed synthetic execute response containing either one missing truncation flag or explicit `copyAllowed=false` on an otherwise raw column. The pinned backend cannot legitimately emit either combination. In each test the normal renderer rejects the envelope, removes the old grid and Markdown/CSV/JSON controls, and leaves the real clipboard unchanged. The separate real backend masked, truncated, and hidden selection test and unit refusal checks remain unchanged.

## Verification

- Independent Pi Standards/Spec review **OK**, P1 **0**, P2 **0**. `git diff --check` and `check_three_level_doc.sh --staged` passed; two L2 docs updated, no L1 change.
- Node 22.22.0; `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed on the reviewed candidate and isolated fast-forward checkout: 143 files / 2,231 tests and Next build. Existing `audit-table.tsx` ESLint warning only.
- `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed **22, failed 0, skipped 0** in `/private/tmp/controlhub-batch-proof.2ljGGn/main`. Next `:3100` and proxy `:8081` CWDs matched the delivery checkout at the reviewed SHA. `/e2e/assembly` verified `c171-delivery` and backend pin on `:18082`, PID 10243, CWD `/Users/fan/GolangProjects/ControlHub-Frontend-workbench-delivery`. Full suite ran in CI; unchanged PG guard expects the protected local `:8080`.
- [PR CI 45924432630](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45924432630): `release-local` (140262372052), 143 files / 2,231 tests and build; `release-e2e` (140262371896), engine checks and `npm run release:e2e`, **234 Chromium passed, 0 failed, 0 skipped**. CI used the matching merge tree and pinned fixture on disposable runner `:8080`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/45924432630/artifacts/15165979043).

## Preservation

Frontend root `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend root `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained 23 starting porcelain entries; snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push. `:8080` PID 69999 and `:18082` PID 10243 retained; Playwright stopped only its own processes. Isolated checkouts and candidate branch retained for verification.
