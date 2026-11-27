# PostgreSQL worksheet selected batch: PR 118

[Frontend PR 118](https://github.com/Fanduzi/ControlHub-Frontend/pull/118) delivers [#179](https://github.com/Fanduzi/ControlHub-Backend/issues/179), the PostgreSQL slice of roadmap item 12. It adds PostgreSQL to the existing **Run selected batch** action: one bounded selection, 2–5 complete statements, one governed first-page request at a time, same connection and resolved schema, and a fresh execution key per statement. Failure or cancellation stops later submissions and preserves earlier result tabs. PostgreSQL cancellation reads evidence for the active key; only the existing terminal evidence proves a database stop. No ordinary Run, backend API, other-engine, transaction, template or production enablement change.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `682698dac67b680cc444e1f0a60455614f2bd909` |
| Reviewed product and isolated fast-forward result | `18beacc3fd74183d9339b0982a729c128a8e6fb1` |
| Product tree | `52f466457c1a399fce8af47415dcc1b2debe45e9` |
| PR CI merge checkout, same tree | `3538546b7c8ce75a3980952421606009ff88a789` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

`git merge --ff-only 18beacc3fd74183d9339b0982a729c128a8e6fb1` advanced the isolated checkout from the base. The normal push range starts at the base and ends at the evidence-only commit carrying this file (`git push origin HEAD:refs/heads/main`).

## Verification

- Independent Pi Standards and Spec review found two issues: preserve the inter-statement abort fallback ahead of the probe guard, and scope browser locators to the batch. Both were fixed, alongside exact tab names, default schema pinning and refreshed history assertions. Independent re-review `16f04a88-9bd9-4b90-820e-df0451be8b6c`: **OK**, P1 **0**, P2 **0**. L2 and `git diff --check` passed; no L1 architecture change. Focused session and SQL scope tests: 126 passed, including separate execution IDs, default resolution, context invalidation, malformed context, timeout and keyed cancellation.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/Users/fan/GolangProjects/ControlHub-redis-type-ttl npm run release:local` passed against the exact candidate and again in the isolated fast-forward checkout `/private/tmp/controlhub-pg-batch.h7eRKJ/main`: 143 files / 2,256 tests, runtime, governance, contracts, TypeScript, lint (one existing warning), and Next build.
- [PR CI 46027784382](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46027784382): `release-local` (140603526432) passed 2,256 tests and build; `release-e2e` (140603526013) passed the cross-repo gates and `npm run release:e2e`: **240 Chromium passed, 0 failed, 0 skipped**. Frontend workspace checkout was the verified PR merge SHA above; the runner used pinned backend fixture `e2e-ci-46027784382-1` on `:8080`. The new PostgreSQL cases cover success with default schema pinning, real backend refusal of statement two, and cancellation after observing statement two active on PostgreSQL. Refusal or cancellation never sends statement three. The same execution key reads back `cancelled` + `stopped`. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46027784382/artifacts/15213629202).
- Earlier candidate `fbfcd7af827855ddf7b7a6f0f391aebf92601ca1`: `npm run test:e2e -- e2e/query-result-contract.spec.ts e2e/query-sql-completion-scope.spec.ts` passed all 25 tests (MySQL batch and completion regressions). Next `:3100` and proxy `:8081` both served `/private/tmp/controlhub-pg-batch.h7eRKJ/frontend`, against verified `c171-delivery` PID 10243, pinned backend `:18082`. The extra isolated local replay could not start because its temporary fixture login file was no longer available; browser coverage for the final tree is the full CI run above. The strict PostgreSQL fixture guard was not changed or bypassed.

## Preservation

Frontend primary worktree `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend primary worktree `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push or code change. Existing `:8080` PID 69999 and `:18082` PID 10243 were preserved. Local Playwright removed only its own listeners. Candidate branch and both isolated worktrees retained for verification.
