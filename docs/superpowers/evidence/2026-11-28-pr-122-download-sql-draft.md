# Download the visible SQL draft locally: PR 122

[Frontend PR 122](https://github.com/Fanduzi/ControlHub-Frontend/pull/122) delivers [#183](https://github.com/Fanduzi/ControlHub-Backend/issues/183), the Download slice of roadmap item 18. It writes only the visible editor's matching ordinary SQL draft as a UTF-8 `worksheet.sql` Blob. Missing, detached, or stale editor state refuses; templates, previews and native commands do not offer the action. The text must reopen unchanged under the non-empty, control-character and 16 KiB rules. No execution, history fetch, result-data access, permission change or download API. Existing result export guards and output formats are unchanged.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `4785f9e8f0b0025b7b1eaedb0ed67c42fcf334b3` |
| Product and isolated fast-forward result | `96f6ac3ba6c8cf6f1984aae715cca65667e278de` |
| Product tree | `381d9672b1cec20f3c363eecf8a522bdfff4edfc` |
| PR CI merge checkout, same tree | `8adb6bedcf1e86e19b616d2bef990e0c0c1ea47d` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

The isolated checkout advanced from the base by `git merge --ff-only`. The normal push range starts at the base and ends at the evidence-only commit carrying this file (`git push origin HEAD:refs/heads/main`). Frontend commit `d24d4450de6dc8cc4be9149d4b5401d300e33a61` separately retires the documentation convention; PostgreSQL fixture SQL is byte-identical apart from the removed header comments. The backend documentation cleanup is not part of this delivery.

## Verification

- Independent Pi security/spec/standards review approved the feature. Final editor-safety re-review `8261db46-a99d-496e-8d3f-fab97d38291b`: **OK**, P1 **0**, blocking P2 **0**. Real browser capture includes all HTTP(S) requests during download. Component tests show no Blob or Execute for missing, detached and stale editor state, and template exclusion preserves ordinary and result-export controls.
- A prior PR CI run exposed a non-deterministic fixture in the existing Cookie denial test. The fixture now always changes the authenticated ciphertext, asserts the change without logging either cookie, and leaves all denial assertions intact. Independent test-only review `d22e46f5-8914-443d-897e-04c7e8d2e236` approved; the fixture shape and changed-value assertion were added. No authentication production code changed.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/private/tmp/controlhub-sql-draft-download.TfRDvP/backend npm run release:local` passed in the isolated checkout: 144 files / 2,280 tests, types, contracts, governance, lint (one existing warning), and build. `git diff --check` passed.
- Final isolated browser checks: `npm run test:e2e -- e2e/query-workbench.spec.ts -g 'downloads the visible SQL draft'` and `npm run test:e2e -- e2e/operator-session.spec.ts -g 'session cookies fail closed'` each passed **1, failed 0, skipped 0**. A real MySQL worksheet downloaded byte-identical text with zero HTTP(S) requests during download, reopened into a new draft, and kept the original independent. The Cookie test verified forged, tampered and expired fixture denial. Next `:3100` and proxy `:8081` served `/private/tmp/controlhub-sql-draft-download.TfRDvP/main` at the product SHA and used the pinned disposable backend on loopback `:58475` and `:58853` respectively. Only owned fixture containers and temporary handoff files were removed.
- [PR CI 46159496487](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46159496487): `release-local` (141023394558) passed 2,280 tests and build; `release-e2e` (141023394821) passed cross-engine gates and `npm run release:e2e`: **246 Chromium passed, 0 failed, 0 skipped**. Frontend checkout was the verified PR merge SHA; backend checkout was pinned. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46159496487/artifacts/15270116204).

## Preservation

Frontend primary worktree `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend primary worktree `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend push or production deployment. Existing listeners `:8080` PID 69999 and `:18082` PID 10243 were preserved. The full mixed-engine suite ran in CI; Firefox and Safari were not tested. Isolated checkouts and candidate branch were retained.
