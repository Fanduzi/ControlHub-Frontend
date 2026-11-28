# ClickHouse worksheet selected batch: PR 120

[Frontend PR 120](https://github.com/Fanduzi/ControlHub-Frontend/pull/120) delivers [#181](https://github.com/Fanduzi/ControlHub-Backend/issues/181), the ClickHouse slice of roadmap item 12. Only an approved regular worksheet can submit a bounded selection of 2–5 statements (8 KiB each, 16 KiB total). It uses one governed Execute at a time, with one pinned approval generation and one tab per delivered first page. Refusal or cancellation stops future submissions; it never adopts a replacement approval mid-batch. ClickHouse is keyless, so cancellation does not establish a remote stop. Ordinary Run, policy, backend APIs, and production configuration are unchanged.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `adb1b1d3d17ee9f19a6e961594d2491836ad3179` |
| Product and isolated fast-forward result | `7c3d111aaabae1549a668e9867cb9163dfd1c8eb` |
| Product tree | `2d08f3074e13c8087b40686fe9f70e7558390230` |
| PR CI merge checkout, same tree | `e279a745e10dd8a4d38a3e6dd65d1354da40c3a8` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

The isolated checkout advanced from the base by `git merge --ff-only`. The normal push range starts at the base and ends at the evidence-only commit carrying this file (`git push origin HEAD:refs/heads/main`).

## Verification

- Independent Pi Standards and Spec review `d137d266-5a9b-4f89-ac51-11f35ceddd1a`: **OK**, P1 **0**, P2 **0**. The final follow-up clarifies the selection hint and documents that the server checks approval on every statement while the client need not poll. L2 and `git diff --check` passed; no L1 architecture change.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/private/tmp/controlhub-clickhouse-batch.TED1O3/backend npm run release:local` passed in the isolated fast-forward checkout: 143 files / 2,262 tests, type checks, contracts, governance, lint (one existing warning), and build. Focused scope/session tests: 132 passed. New tests cover absent approval, no key, an unchanged approval on every request, and dropping a late result after known approval change or cancellation.
- `CONTROLHUB_CH_BROWSER_CHECKOUT=/private/tmp/controlhub-clickhouse-batch.TED1O3/main go test -tags=integration -count=1 -v -run '^TestClickHousePreviewHTTP$' ./internal/integration` passed. Next/BFF served from the isolated frontend checkout on loopback `:53404` at the product SHA; its Go fixture came from the clean pinned backend checkout. Chromium proved three ordered first-page tabs, one approval across all POSTs, no batch paging or execution key, and a real disclosure refusal on statement two with statement one retained and no third POST.
- Separate deterministic backend test: `go test -tags=integration -count=1 -v -run '^TestClickHousePreviewHTTP$/^batch_approval_rotation$' ./internal/integration` in the local test-only `backend-approval-proof` checkout passed. Actual fixture approval changed after the first Execute returned 200; the second request using the original generation returned 403 `query_not_allowed` with no rows; a separate request with a fresh generation returned 200. Browser CI exercises live disclosure denial, not this approval-file mutation. Local proof diff `approval-rotation-test.patch` SHA-256 `694543939703bb915f920e10de23cbf34e74406bef40ae3dbd946d52a3972c73`, with `approval-rotation.log` in the isolated delivery directory; no backend commit or push.
- [PR CI 46112907472](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46112907472): `release-local` (140880195004) passed 2,262 tests and build; `release-e2e` (140880195226) passed the real ClickHouse browser proof above and the cross-engine gate, followed by `npm run release:e2e`: **244 Chromium passed, 0 failed, 0 skipped**. The frontend checkout was the verified PR merge SHA and backend checkout was pinned. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46112907472/artifacts/15251177220).

## Preservation

Frontend primary worktree `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend primary worktree `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. Existing listeners `:8080` PID 69999 and `:18082` PID 10243 were preserved. Only owned disposable test resources were cleaned. Full mixed-engine browser coverage ran in CI, not against protected local services. Isolated checkouts, local proof patch, and candidate branch were retained.
