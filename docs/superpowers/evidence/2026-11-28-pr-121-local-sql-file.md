# Open local SQL files as new worksheet drafts: PR 121

[Frontend PR 121](https://github.com/Fanduzi/ControlHub-Frontend/pull/121) delivers [#182](https://github.com/Fanduzi/ControlHub-Backend/issues/182), the Open slice of roadmap item 18. On SQL targets a picked `.sql` file opens only as a new draft in the original target and connection/schema. Reads are capped at 16 KiB before and after IO; strict UTF-8, blank and invisible control validation precede activation. Source filename and path are not persisted. A changed context invalidates the selection, even after returning to the same worksheet. Aggregate workspace capacity is checked before mutation. Only ordinary workspace text autosave and explicit governed Run can reach their existing APIs. No new file endpoint, execution on import, HTML rendering, export or permissions change.

| Ref | Verified SHA |
| --- | --- |
| Frontend base and pre-push `origin/main` | `3303db4defb5b458233075535794738a9d655352` |
| Product and isolated fast-forward result | `b880d550b47046b15544428dd2ab99372d5067b1` |
| Product tree | `c01af72e2ccf123ecfc1c203b596158320d42241` |
| PR CI merge checkout, same tree | `49bc9fd343c325ab5bba919ee419e0560826aabf` |
| Unchanged backend `origin/main` and fixture pin | `14e19603b7086f7164738cca4c6290894b0cdc21` |
| Pinned backend tree | `b0c92f5c29ab08a56b80e4846c3eec7e9fe6b3a5` |

The isolated checkout advanced from the base by `git merge --ff-only`. The normal push range starts at the base and ends at the evidence-only commit carrying this file (`git push origin HEAD:refs/heads/main`).

## Verification

- Independent Pi security, standards and spec review followed by re-review `532ee82d-ce7d-4410-864e-bd963038e313`: **OK**, P1 **0**, P2 **0**. Fixes latch scope changes through a switch-and-return, reject invisible formatting controls, scope notices, verify workspace limit refusal at the UI and verify filename absence on the real autosave request. L2 and `git diff --check` passed; no L1 architecture change.
- Node 22.22.0: `npm ci` and `VITEST_MAX_WORKERS=2 CONTROLHUB_BACKEND_DIR=/private/tmp/controlhub-sql-draft-import.sZDgEI/backend npm run release:local` passed in the isolated fast-forward checkout: 144 files / 2,276 tests, types, contracts, governance, lint (one existing warning), and build. The focused SQL file, worksheet session and workbench component suites passed 334 tests.
- `npm run test:e2e -- e2e/query-workbench.spec.ts -g 'opens a local SQL file'` from the isolated checkout passed **1, failed 0, skipped 0**. Real MySQL: malformed UTF-8 created no draft, markup-like SQL stayed literal, normal autosave succeeded and did not contain the filename, and the only execute POST was the edited text on manual Run. The original draft was unchanged. Next `:3100` and proxy `:8081` served `/private/tmp/controlhub-sql-draft-import.sZDgEI/main` at the product SHA; assembly `sql-import-sZDgEI-b475d3e3` used the pinned clean backend binary and disposable MySQL over loopback `:53296`. Both owned containers and temporary handoff state were cleaned.
- [PR CI 46138154286](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46138154286): `release-local` (140957979548) passed 2,276 tests and build; `release-e2e` (140957979298) passed cross-engine browser gates and `npm run release:e2e`: **245 Chromium passed, 0 failed, 0 skipped**. The frontend checkout was the verified PR merge SHA and the backend checkout was pinned. [Sanitized artifact](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/46138154286/artifacts/15261032363).

## Preservation

Frontend primary worktree `1adb2552a8514946fb6b4f691411dab9b79efadd` stayed clean. Backend primary worktree `0a1afa0b4bda194719d61388fa522c4a1f38cd96` retained all 23 starting porcelain entries; exact snapshot SHA-256 `e0b5cbde2b3fe00e3030aebf8837efb67554dd4802c047421eb9a89d80f39bf1`. No backend change or push. Existing listeners `:8080` PID 69999 and `:18082` PID 10243 were preserved. The full mixed-engine suite ran in CI, not against protected local services. Isolated checkouts and candidate branch were retained.
