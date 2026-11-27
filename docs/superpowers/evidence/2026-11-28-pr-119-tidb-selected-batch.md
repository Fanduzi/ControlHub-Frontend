# TiDB worksheet compatibility and selected batch: PR 119

[Frontend PR 119](https://github.com/Fanduzi/ControlHub-Frontend/pull/119) delivers [#180](https://github.com/Fanduzi/ControlHub-Backend/issues/180), the TiDB worksheet slice of roadmap items 2 and 12. A bounded selection of 2–5 statements runs through existing governed Execute one at a time, with a fresh TiDB execution key and a first-page tab for each success. Refusal or cancellation preserves earlier results and stops new submissions. The keyed cancellation record reflects the server outcome, not a confirmed database stop; the UI says the remote status is unknown. Ordinary Run remains keyless; no backend, policy, production configuration, or other-engine change.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `b733e212a82589b8df4281f295295e5e5729d800` |
| Reviewed product and isolated fast-forward result | `4e877680b6e38d8342c5ed5844d7dc990ebae496` |
| Product tree | `93332f2682210f5e3c71759abebdff2b62dade3f` |
| PR CI merge checkout, same tree | `79a088cccfa14c91003876425863d233365445d3` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

The isolated checkout advanced from the base to the reviewed product by `git merge --ff-only`. The normal push range starts at the base and ends at the evidence-only commit carrying this file (`git push origin HEAD:refs/heads/main`).

## Verification

- Independent Pi Standards and Spec reviews confirmed scope and identified two fixes: explicitly disclose the unknown database state and allow only the existing development-console patterns and the expected refusal. Re-review `fa8c1f11-0807-436c-82ed-4291fa337697`: P1 **0**, P2 **0**. Final incremental review `6cf803be-87fa-4136-871b-a2064b02bc19`: **OK**, P1 **0**, P2 **0**. Staged L2 and `git diff --check` passed; no L1 change.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/private/tmp/controlhub-tidb-batch.2T3Emo/backend npm run release:local` passed in the candidate and isolated fast-forward: 143 files / 2,257 tests, type checks, contract and governance checks, lint (one existing warning), and build. Focused session and SQL selection tests: 127 passed. Backend `go test -tags=integration ./internal/integration -run '^TestTiDBKeyedHTTP$' -v -count=1 -timeout=8m` passed all eight subtests against real TiDB 8.5.0.
- `npm run test:e2e -- e2e/query-workbench-tidb.spec.ts` passed **4, failed 0, skipped 0** from both final trees. Next `:3100` and proxy `:8081` served `/private/tmp/controlhub-tidb-batch.2T3Emo/main` at the reviewed product on the isolated replay. The isolated backend `tidb-workbench-2T3Emo` reported the pinned backend SHA and used loopback `:64478` mapped to its own `:8080`. The worksheet demonstrated ordinary paging and masked CSV/JSON refusal; success, disclosure refusal, and cancellation with a positive TiDB activity barrier; unique execution IDs; and no third POST after refusal/cancellation. The keyed cancel reads `failed` / `query_canceled` and the UI does not claim a database stop.
- The disposable CI fixture script refused a non-test metadata DB before side effects, seeded against a fresh loopback DB, and cleaned only its own IDs. The final monitor uses a tmpfs for the unused MySQL data mount. Verified no anonymous volume was attached and both fixture containers were absent after teardown.
- [PR CI 46080447616](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46080447616): `release-local` (140777932373) passed 2,257 tests and build; `release-e2e` (140777932042) passed cross-repo gates and `npm run release:e2e`: **244 Chromium passed, 0 failed, 0 skipped**. The frontend checkout was the verified PR merge SHA above; its pinned backend fixture `e2e-ci-46080447616-1` served disposable runner `:8080`. Both TiDB fixture containers were removed in the teardown step. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46080447616/artifacts/15237414220).

## Preservation

Frontend primary worktree `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend primary worktree `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push or code change. Existing `:8080` PID 69999 and `:18082` PID 10243 were preserved. The final owned local proof containers and credentials were removed; no global Docker prune. The full mixed-engine browser suite ran in CI, not against protected local services. Candidate branch and isolated worktrees were retained for verification.
