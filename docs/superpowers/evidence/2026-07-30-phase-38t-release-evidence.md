# Phase 38T: Paging Boundaries — Release Evidence

Candidate snapshot evidence. All values below were observed on the candidate
worktrees before merge; this file records only verified facts about the code
candidates and deliberately contains no merged SHA and no CI URL (those are
produced after this commit exists). This evidence file is committed on its
own, after which every frontend gate and E2E round is re-executed against the
final candidate HEAD that includes it.

## Scope

Phase 38T hardens the governed result-paging boundaries introduced in
Phase 38S:

- Backend: a paginated bare SELECT whose page window exceeds the executor
  response-byte cap is now a controlled rejection
  (`ErrQueryResultTooLarge` → HTTP 400 `validation_failed`,
  "result set exceeds configured limits") instead of a partial page, so a
  fixed offset can never skip rows the operator never received. Negative
  `maxRows` in the paginated path now hits the existing
  `ErrQueryLimitInvalid` validation. Non-paginated execution and
  `QueryRelatedRecords` keep their existing truncated-success behavior.
- Frontend: worksheet `maxRows` is valid by construction — the committed
  `maxRows` and every issued Run always carry the last valid value even while
  the input box holds an out-of-range draft.

## Candidate snapshot

| Repo | Base (`origin/main`) | Code candidate HEAD | Branch |
| --- | --- | --- | --- |
| Backend (`ControlHub`) | `c6f631de40003b6b4aaea09914913038cbf14037` | `d776709107f94fc909fa036006f043eef5a5fa08` | `phase-38t-paging-boundaries-backend` |
| Frontend (`controlhub-ui`) | `9866c91188f28737db184cc4cdc66e3dafa4595f` | `39e81a33dea8c18eb39637fbb3b6c950eacd20ff` | `phase-38t-paging-boundaries-ui` |

Candidate worktrees:

- Backend: `/Users/fan/GolangProjects/ControlHub-wt-38t` (clean at snapshot)
- Frontend: `/Users/fan/JsProjects/ControlHub-wt-38t` (clean at snapshot)

Candidate commits on top of the baselines:

- Backend: `d776709` (oversized paginated windows rejected; negative maxRows
  classified as limit error; unit + real-MySQL integration proofs).
- Frontend: `39e81a3` (worksheet maxRows valid by construction; unit tests for
  preferences and shell behavior).

## Backend gates (run at `d776709`)

| Command | Result |
| --- | --- |
| `git diff --check c6f631d...HEAD` | clean |
| `git diff --name-only -z c6f631d...HEAD -- '*.go' \| xargs -0 -r gofmt -d` | empty output |
| `go vet ./...` | pass |
| `go build ./...` | pass |
| `go test -count=1 ./...` | all 10 packages `ok` |
| `make openapi-validate` | PASS |
| `make test-integration` | `ok internal/integration` (real MySQL testcontainer) |
| `make test-openapi-fuzz` | `ok internal/integration` |
| `go test -tags=integration -count=1 ./internal/integration` | `ok` |

## Frontend gates (run at `39e81a3`)

| Command | Result |
| --- | --- |
| `git diff --check 9866c91...HEAD` | clean |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run lint` | 0 errors (5 pre-existing baseline warnings, identical on baseline) |
| `npm run test` | 86 files, 1308 tests, all passed |
| `npm run build` | success |
| `npm run check:e2e-preflight` | complete (ports 3100/8081 free) |
| `npm run check:e2e-governance` | passed (13 spec files scanned) |

## Candidate E2E (real browser, no mocks)

Command (frontend candidate worktree):

```bash
BACKEND_URL=http://localhost:8082 PLAYWRIGHT_PROXY_TARGET=http://localhost:8082 \
  npx playwright test e2e/query-workbench.spec.ts
```

Pre-evidence validation run at frontend `39e81a3`: **70 passed / 0 failed /
0 skipped**. Three consecutive official runs are executed against the final
candidate HEAD (this evidence commit) before merge; each must be 70/0/0.

Runtime provenance:

- Candidate backend: PID `42464`, port `8082`, CWD
  `/Users/fan/GolangProjects/ControlHub-wt-38t`, binary
  `/tmp/controlhub-38t-candidate-server` built from `d776709`.
- API proxy: `e2e/api-proxy.mjs` on port `8081` with
  `PLAYWRIGHT_PROXY_TARGET=http://localhost:8082` (Playwright-managed per run).
- Frontend dev server: port `3100`, frontend candidate worktree
  (Playwright-managed per run).
- Query E2E MySQL fixture: Docker `controlhub-query-e2e-mysql`,
  host `127.0.0.1`, port `13306`, database `query_e2e`.
- Root services on ports `8080`/`3000` were never touched.

## Oversized-window boundary verification (real browser + real API)

A dedicated throwaway fixture `query_e2e.qe_oversized_38t` (12 rows × 16
`mediumtext` columns × 8192 bytes ≈ 131 KB/row, disclosure policies seeded
`raw_copy_allowed` for the E2E target) proved in a real Chromium session
against the candidate backend:

- Paginated Run (`pagination {page:1, pageSize:10}`) of the oversized bare
  SELECT returned a controlled HTTP 400 `validation_failed`
  ("query validation failed: result set exceeds configured limits"); the page
  rendered zero result cells and no paging controls, and exactly one execute
  request was issued (no follow-up page requests).
- The same statement without `pagination` kept the existing
  truncated-success contract: `status=success`, `truncated=true`, 7 rows,
  `pagination=null`.
- All paginated traffic went through `POST /query-targets/{id}/execute`.

The fixture table and its disclosure-policy rows are removed after
verification; they exist only in the disposable E2E MySQL container and the
local dev metadata database.

## Review conclusion

The candidate ranges (backend `c6f631d...d776709`, frontend
`9866c91...39e81a3`) were reviewed and gated with no P1/P2 findings
remaining. The oversized paginated window is fail-closed (controlled 400,
no partial page, audit/history record `validation_failed`), negative maxRows
is a limit error in both plain and paginated paths, and non-paginated
execution keeps truncated success.

## Accepted non-blocking P3

Typing `501` into the Max rows input may transiently display `501` in the
input box, but the committed `maxRows` and every actually issued Run keep the
last valid value (`50`). Accepted as-is for this release; no scope extension
or code change.

## Root-repo WIP whitelist (preserved, untouched)

- Backend root `/Users/fan/GolangProjects/ControlHub`: modified `CLAUDE.md`,
  untracked `.opencode/`, `package-lock.json`.
- Frontend root `/Users/fan/JsProjects/ControlHub`: untracked `plans/`.
- Verified: neither candidate diff overlaps any of these paths.

## Cleanup plan

After fast-forward merge, merged-root E2E (three runs), push, and CI
verification all succeed, remove exactly the two Phase 38T worktrees and the
two candidate branches listed above. Stop only the Phase 38T candidate
services whose PID/CWD provably belong to the candidate worktrees; all other
services, worktrees, branches, and user files stay.
