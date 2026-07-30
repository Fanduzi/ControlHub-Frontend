# Phase 38S: Governed Query Result Paging — Release Evidence

Candidate snapshot evidence. All values below were observed on the candidate
worktrees before merge; this file records only verified facts about the code
candidates and deliberately contains no merged SHA and no CI URL (those are
produced after this commit exists).

## Candidate snapshot

| Repo | Base (`origin/main`) | Code candidate HEAD | Branch |
| --- | --- | --- | --- |
| Backend (`ControlHub`) | `a1b307c895076dfd66b40054019295079f9d97f5` | `c6f631de40003b6b4aaea09914913038cbf14037` | `phase-38s-governed-query-result-paging-backend` |
| Frontend (`controlhub-ui`) | `122c642aa934db119e1a3c4fcf51346143342409` | `787ec6c866a15aa955440a869d2136ad777fca5e` | `phase-38s-governed-query-result-paging-ui` |

Candidate worktrees:

- Backend: `/Users/fan/GolangProjects/phase-38s-governed-query-result-paging-backend` (clean at snapshot)
- Frontend: `/Users/fan/JsProjects/phase-38s-governed-query-result-paging-ui` (clean at snapshot)

Repair commits on top of the original Phase 38S candidate:

- Backend: `e4d63c4` (P1: paginated maxRows routed through guard default/hard-cap
  clamping), `87b89be` (P2: dead pagination validators removed, OpenAPI paging
  contract corrected, real-MySQL bypass-proof integration test), `c6f631d`
  (gofmt `cmd/server/main.go`).
- Frontend: `0090f21` (P1: default maxRows 100 persisted under
  `controlhub.query.max-rows`), `5fbe7f8` (P2: phantom cursor wire contract
  removed), `881e171` (P2: worksheet-scoped pageSize + in-flight Run
  invalidation on maxRows change), `a43eaef` (P2: dead i18n keys and
  self-referential tests removed), `3863dab` (six new real-browser paging E2E),
  `787ec6c` (spec/design docs aligned).

## Backend gates (run at `c6f631d`)

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `git diff --name-only a1b307c...HEAD -- '*.go' \| xargs gofmt -l` | empty output |
| `go vet ./...` | pass |
| `go build ./...` | pass |
| `go test -count=1 ./...` | all 10 packages `ok` |
| `make openapi-validate` | PASS |
| `make test-integration` | `ok internal/integration` (real MySQL testcontainer) |
| `make test-openapi-fuzz` | `ok internal/integration` |
| `go test -tags=integration -count=1 ./internal/integration` | `ok` |

Known pre-existing, out-of-scope condition: 31 additional files on `main`
carry gofmt struct-tag alignment drift that predates this candidate and sits
entirely outside the candidate diff range; they were intentionally left
untouched.

## Frontend gates (run at `787ec6c`)

| Command | Result |
| --- | --- |
| `git diff --check` | clean |
| `npx tsc --noEmit -p tsconfig.json` | clean |
| `npm run lint` | 0 errors (5 pre-existing baseline warnings) |
| `npm run test` | 86 files, 1300 tests, all passed |
| `npm run build` | success |
| `npm run check:e2e-preflight` | complete |
| `npm run check:e2e-governance` | passed (13 spec files scanned) |

## Independent adversarial re-review

An independent re-review of the exact ranges (backend
`a1b307c...c6f631d`, frontend `122c642...787ec6c`) concluded:
**no P1/P2 findings remain** in either repo. Verified points included:
HardMaxRows clamping in both plain and paginated guard paths (including a
2,000,000,000-maxRows integration proof), no LIMIT+1 sentinel row leakage,
honest effective `pageSize` in response metadata, zero
`ValidatePaginationPage` residue, OpenAPI/Go model parity, no phantom
cursor/hasMore wire fields, strict worksheet-scoped pageSize, requestId
rotation on maxRows change, dead i18n keys absent from both locales with key
parity intact, and no mocks/`page.evaluate`/forced clicks/skips in the new
E2E block. Remaining items are non-blocking P3/nit only.

## Candidate E2E (real browser, no mocks)

Command (frontend candidate worktree):

```bash
BACKEND_URL=http://localhost:8082 npx playwright test e2e/query-workbench.spec.ts
```

Four consecutive runs, each **70 passed / 0 failed / 0 skipped** (64
pre-existing + 6 new governed-paging tests). Runtime provenance:

- Candidate backend: port `8082`, CWD
  `/Users/fan/GolangProjects/phase-38s-governed-query-result-paging-backend`,
  binary built from `87b89be` (runs 1–3) and rebuilt from `c6f631d` (run 4).
- API proxy: `e2e/api-proxy.mjs` on port `8081` with
  `PLAYWRIGHT_PROXY_TARGET=http://localhost:8082`.
- Frontend dev server: port `3100`, frontend candidate worktree.
- Root services on ports `8080`/`3000` were never touched.

## Root-repo WIP whitelist (preserved, untouched)

- Backend root `/Users/fan/GolangProjects/ControlHub`: untracked `.opencode/`,
  `package-lock.json`.
- Frontend root `/Users/fan/JsProjects/ControlHub`: untracked `plans/`.
- Verified: neither candidate diff overlaps any of these paths.

## Cleanup plan

After fast-forward merge, merged-root E2E (three runs), push, and CI
verification all succeed, remove exactly the two Phase 38S worktrees and the
two candidate branches listed above. Stop only the Phase 38S candidate
services whose PID/CWD provably belong to the candidate worktrees; all other
services, worktrees, branches, and user files stay.
