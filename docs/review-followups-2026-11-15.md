# Review follow-ups — 2026-11-15

Review follow-up record for `fix/review-followups-20261115` (frontend
worktree `/tmp/chub-fix-fe`). The frontend companion now pins backend main
merge `a94afd7a1cdeeda5924c6f358f9650b2654e660a` / tree
`7e0471c70d8feb29deeef3d8579a193f358143f5`, from backend PR #151. Its tree
is identical to reviewed implementation `4fb3e9bd00445711dd991b68326ec13e5bfa7005`.

Both application PRs are merged and their required PR checks passed. The
publication snapshot below fixes the reviewed application identities and
verified CI evidence. A later documentation-only evidence tip is distinct
from the application merge commits; its attached GitHub checks are verified
separately before declaring final closure.

Base refs: backend `0fa8c43c8223da6b83dbb34856f0bd7160a860e9`, frontend
`897d5c93e82aeb3c49a3a27fb701cb3e8f904cef`. Root `main` checkouts and the
backend's existing dirty paths and stashes were preserved.

## Application publication snapshot

| Repository | Base | Reviewed candidate | Application merge and origin/main at publication |
| --- | --- | --- | --- |
| Backend | `0fa8c43c8223da6b83dbb34856f0bd7160a860e9` | `4fb3e9bd00445711dd991b68326ec13e5bfa7005` | `a94afd7a1cdeeda5924c6f358f9650b2654e660a` |
| Frontend | `897d5c93e82aeb3c49a3a27fb701cb3e8f904cef` | `3276a6492025c0622fdbaaf47eccdd54e0962ae7` | `83beebf24dc1d7d8ddbbc8bf786245db30e6b9e9` |

- Backend [PR #151](https://github.com/Fanduzi/ControlHub-Backend/pull/151)
  and frontend [PR #87](https://github.com/Fanduzi/ControlHub-Frontend/pull/87)
  used ordinary merge commits, with exact-head guards and no admin bypass,
  force push, squash, or history rewrite. Each application merge tree was
  compared with its passing candidate and was identical.
- Backend source tree: `7e0471c70d8feb29deeef3d8579a193f358143f5`.
  Frontend application tree: `8eff8608537c5ce30b524ec0c31b21b76cef092f`.
- Backend feature ref was created at `4fb3e9b`; main advanced
  `0fa8c43..a94afd7`. Frontend feature ref was created at `99188cb`
  (including implementation `0d1c948`), then advanced
  `99188cb..f47e194..3276a64`; application main advanced
  `897d5c9..83beebf`. Both local main checkouts were fast-forwarded only.

### Verified source gates

| Immutable run | Required jobs | Result |
| --- | --- | --- |
| [Backend PR](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/43719087871) at `4fb3e9b` | `release-local-gates`, `release-docker-gates` | Both SUCCESS |
| [Backend main](https://github.com/Fanduzi/ControlHub-Backend/actions/runs/43723001390) at `a94afd7` | `release-local-gates`, `release-docker-gates` | Both SUCCESS |
| [Frontend PR](https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/43731350701) at `3276a64` | `release-local`, `release-e2e` | Both SUCCESS |

The backend CI runs execute `make release-local-gates`, the Argon2id budget,
`govulncheck`, and `make release-docker-gates` (integration and complete
OpenAPI fuzzing). The frontend CI runs execute `release:local` and
`npm run release:e2e`, which expands to the fixture identity gate and
`env -u NO_COLOR playwright test` without a grep filter.

The passing full browser run executed **220 passed, 0 failed, 0 skipped**.
Its served assembly identified backend
`a94afd7a1cdeeda5924c6f358f9650b2654e660a`,
`runId=e2e-ci-43731350701-1`, `listen=:8080`; both the preflight and in-suite
assembly check confirmed that identity. Earlier local focused proof used
`/tmp/chub-e2e-be` at reviewed `4fb3e9b` (the same backend tree), not the
pre-existing demo listener at port 8082.

Review methods: complete candidate and follow-up diffs, normalized lockfile
inspection, captured failing DOM versus exact localized catalogs, actual
browser screenshots, and foreground/settled axe checks. Final scoped review
verdict: **APPROVE; zero unresolved confirmed P1/P2 findings**. Development
advisory entries, the TanStack warning, and manual accessibility-check
limitations remain explicitly disclosed below; they are not hidden by gates.

### Preservation and assets

The root preservation guard passed before publication. Backend's tracked
`advisor-plans/README.md` retained blob
`46616c0ada03c322101d032ef68ffcc47a1ff35e`; its two original stashes retained
objects `53d3226426da0d9956e5e4758328bcd6d70d9141` and
`99b268c52d3afb98a5db57a2db45d0984eb8e123`. Frontend root was clean before
and after the application fast-forward. No user work was stashed, reset,
cleaned, relocated, or overwritten.

The backend's pre-existing untracked-path whitelist was preserved:

```text
.codex/
.cursor/
.devin/
.grok/
.mcp.json
demo-fix-pg-ready.png
demo-supplement-mysql-zh.png
docs/decisions/2026-08-04-parameter-value-evidence-retention.md
docs/decisions/2026-08-09-operator-session-boundary.md
docs/decisions/2026-08-21-phase-38x-5-controlled-error-code-contract.md
docs/decisions/2026-08-29-ci-ingestion-is-previewed-and-atomic.md
docs/decisions/2026-08-29-inventory-integrity-is-server-owned.md
docs/decisions/2026-08-29-inventory-is-curated-from-source-observations.md
docs/decisions/2026-08-29-machine-principals-are-not-users.md
docs/superpowers/plans/2026-08-04-phase-38w-governed-parameterized-saved-templates-design.md
docs/superpowers/specs/2026-08-04-phase-38w-governed-parameterized-saved-templates.md
docs/superpowers/specs/2026-08-09-phase-38x-operator-authentication-boundary.md
docs/superpowers/specs/2026-08-21-phase-38x-5-controlled-error-code-and-release-graph.md
docs/superpowers/specs/2026-09-23-postgresql-query-workbench-v1.md
topology-dev-graph.png
```

All four `docs/screenshots/{overview,query-explain,resources,topology}.png`
assets are tracked on frontend main; all four raw main URLs returned HTTP
200 after the application merge. The three locally created test containers,
their three anonymous volumes, and test listeners 8080/8081/3100 were
cleaned through owned fixture paths. Existing demo data volumes, stopped
demo containers, the old 8082 listener, daily MySQL 3306, task worktrees,
fixture/spec/cursor branches, and original stashes were intentionally kept.
No unrelated tracker issue was closed and production PG defaults were not
changed.

## UX findings (6) — dispositions

| ID | Finding | Disposition |
|----|---------|-------------|
| UX-01 | Restored worksheet name collisions | Fixed: hydrate computes next index from the max generated-name suffix (EN+zh+id pattern, `list.length` floor), collision loop on add, safe-integer guard resets the counter on range overflow; persisted/user titles never rewritten |
| UX-02 | Chinese UI hardcoded English navigation/actions | Fixed: injected localized name callbacks (`Worksheet {n}` / `工作表 {n}`, `预览：{table}`), localized history Select items/status options, localized unsaved-changes and governance copy under zh-CN |
| UX-03 | Accessibility ownership/labels/contrast | Fixed (fresh axe wcag2a/aa on stable light Explain-ready state: **0 violations**): worksheet `tablist` contains only `role=tab` buttons — decorative `data-close-worksheet` × span inside the tab (pointer close via `closest()` without activating), real Close/Rename controls and the rename input moved to the adjacent toolbar, shared `worksheet-content` tabpanel `aria-labelledby` the active tab (tab stays mounted and panel labeled during rename), Arrow/Home/End move focus, Delete closes the focused tab and F2/double-click starts rename, surviving active tab refocused after close, environment Select labeled, `.cm-content` declares explicit `tabindex` 0 (−1 while disabled) — real-browser Tab reaches the editor — avatar initials `text-foreground` and Ready badge `text-green-800` fix the two verified near-threshold light contrast items; light-theme state text darkened to -700 tones |
| UX-04 | History implementation-vocabulary copy | Fixed: `[statement withheld]` localized, `cancelled` in status options, controlled error-code translations + generic fallback; raw server text never rendered |
| UX-05 | PG Memoize temporary-table warning | Fixed: Memoize/Materialize map to `container`, CTE/WorkTable Scan map to `table_access` — none emit temp-table/filesort warnings; access badge suppressed for `unknown` access except on `table_access`/`index_access` where it stays meaningful |
| UX-06 | Mobile connection drawer displaces shell | Fixed: QueryContextBar wraps (`min-h-12 flex-wrap min-w-0`), context vs shrink-0 actions grouped; verified `main.x=0`, `header.x=0`, `body.scrollWidth=viewport` at 390 px and 320 px after two open/close cycles; Playwright regression passes |

## UX recommendations (3) — dispositions

| Rec | Disposition |
|-----|-------------|
| P2 simplify workbench hierarchy | Implemented: credential-managed helper moved into Governance Details dialog; compact row keeps governance badges; diagnostic IDs stay secondary |
| P2 clarify environment scope on Topology | Implemented: localized scope-guidance copy noting topbar selector and in-page buttons are the same scope; pinned query target flow unchanged |
| P2 filtered-empty vs empty inventory | Implemented: filter-key detection (`q`/`resourceType`/`resourceSubtype`/`lifecycleStatus`/`healthStatus`/`label`/`ownerId`/`archiveFilter`/`includeArchived`/`archivedOnly`) drives specific no-match copy + Clear Filters (preserves environment/pageSize/sort/presentation, resets `page=1`, cancels queued debounced search); unfiltered empty shows scoped inventory copy |

## Technical findings — dispositions

- **PostgreSQL Explain operations**: `hash_join`/`merge_join` added to the
  finite union (backend commit); Sort/Incremental Sort emit no filesort
  warning; Memoize/Materialize map to `container`, CTE/WorkTable Scan map to
  `table_access` — the structural containers emit no temp-table warning.
- **Login throttling**: backend fixed-window limiter (60 s, 120/IP,
  30/account, 10 k namespaced keys, `RemoteAddr` only, body ≤ 16 KiB) returns
  429 `login_rate_limited` + `Retry-After: 60`. Frontend maps HTTP 429 →
  `rate-limited` → controlled facade 429 with no session cookie; login page
  shows the localized too-many-attempts message; `login_rate_limited` added
  to the controlled-error union and both locale `errors.codes` catalogs.
- **Backend toolchain security** (inside the local pin): Go `1.26.11`,
  `x/text` `v0.41.0`, Vitess `v0.24.5` (x/sync transitive → `v0.22.0`) via
  `go get` + `go mod tidy`; repo-wide `gofmt` drift normalized; MySQL fixture
  binds `127.0.0.1:${PORT}:3306`; backend CI gained gofmt + `govulncheck`
  1.9.0 steps before the local release gates.
- **Frontend dependency security**: `next` 16.2.3 → **16.4.6** (critical
  advisories, deliberate <7-day exception per lead design); `vitest` →
  ^4.1.12; `shadcn` ^4.23.0 moved to devDependencies (build-time CSS only);
  `eslint-config-next` restored to the original **16.2.3** baseline with an
  explicit dev pin `eslint-plugin-react-hooks` **7.0.1** — the mandated
  upgrade had pulled a stricter React-Compiler lint regime (15 pre-existing
  `set-state-in-effect` errors); the baseline is retained rather than
  refactoring unrelated code. `eslint.config.mjs` untouched, no rule
  suppressions.
- **CORS**: unconditional localhost CORS middleware removed server-side;
  same-origin BFF remains the only boundary.
- **CI**: `npm audit --audit-level=high
  --registry=https://registry.npmjs.org` step added after release-local
  `npm ci` (frontend-ci.yml); Schemathesis install pinned to
  `schemathesis==4.15.2`, `hypothesis-jsonschema==0.23.2`,
  `hypothesis==6.170.15` after the exact compatibility probe passed locally
  (array-generation PASS). During delivery, GitHub's `ubuntu-latest`
  resolved to Ubuntu 26.04, unsupported by pinned Playwright 1.59.1; the
  browser installer refused before any spec ran. With user approval, only
  `release-e2e` is fixed to supported `ubuntu-24.04`. Test commands,
  assertions, timeouts and security gates are unchanged.
  On the pinned runner (CI run `43728912666` @ `f47e194`) the browser
  install passed and 220 specs executed: 216 passed, 4 failed — all
  stale-selector failures, confirmed against CI error-context artifacts
  and the source catalog rather than product regressions. Fixed as a
  test-only update: withheld-history preview now expects the exact
  catalog copy `Statement content is withheld by privacy policy.` (with
  a scoped negative assertion keeping the original privacy intent), and
  worksheet-tab selectors follow the active locale (`/^worksheet$/i` EN
  / `/^工作表$/` zh). This entry records the failing run and its test-only
  correction, not a later CI conclusion.
- **Repo hygiene**: `.gitignore` anchored entries for `/smoke-*.png` and
  `/tpl-*.png` ignore only **root-level** E2E failure/proof captures while
  still allowing nested documentation assets such as `docs/screenshots/`.
- **Fixture hardening**: `pg-fixture-up.sh` launches the disposable listener
  with `CONTROLHUB_PG_HTTP_ENTRIES=on` for this run only and requires a
  VCS-stamped binary (`vcs.revision` equal to the pin, `vcs.modified` not
  true — a real clone when linked-worktree builds lack the stamp);
  `pg-fixture-lifecycle` allocates two distinct `listen(0)` loopback ports
  per test instead of fixed 55439/18099.

## Measured verification — implementation-stage local evidence

These original local measurements are retained without re-derivation. The
remote gates and published application refs are recorded above.

| Check | Result |
|-------|--------|
| `npm ci` (clean, npm 10.9.4 / Node 22.22.0, official registry) | rc=0 (`fe-npm-ci.log`); earlier npm `edgesOut` crash did not recur |
| `release:local` (runtime gate, e2e preflight, governance, controlled-error match vs BE 4fb3e9b, tsc, lint, 2078 unit tests, build) | rc=0 (`fe-release-local2.log`); all counts on vitest 4.1.12 / eslint-config-next 16.2.3 / react-hooks plugin 7.0.1 |
| Subsequent narrow tests (tab-strip redesign) | 330/330 in the two touched component test files; focused lint + tsc clean |
| `npm audit --omit=dev --json` | **0 vulnerabilities** (`fe-audit-prod-only2.json`) |
| `npm audit --audit-level=high` | rc=0 (`fe-audit-high-final2.log`) |
| `npm audit` full | 13 residual dev dependency entries (2 low / 11 moderate) in deepmerge/minimatch/typescript-eslint chains; npm's non-force automatic fix is exhausted and its `--force` proposal would downgrade unrelated framework packages — rejected, not proven to be the only remaining fix (`fe-audit-full-final.json`) |
| ESLint full | 0 errors, 1 warning — pre-existing `react-hooks/incompatible-library` on `useReactTable` (`audit-table.tsx:269`); not fixed, not suppressed (`fe-eslint-full3.log`) |
| Backend `make release-local-gates` | rc=0 on reviewed source `4fb3e9b`, whose tree equals merged pin `a94afd7` (`be-release-local-gates.log`); remote merge checks are listed above |
| Backend `govulncheck@v1.9.0` | 0 called-code vulnerabilities (`be-govulncheck-final.log`) |
| Schemathesis/Hypothesis compatibility probe | PASS in isolated venv (`be-schemathesis-probe.log`) |
| `check:e2e-pg-fixture` | all PASS vs assembly `{backendSha:4fb3e9b, pgEntries:true, runId:e2e-review-1794736110}` |
| Focused Playwright (Explain + reload + drawer) | **3/3 pass** in 15.3 s — `PostgreSQL Explain renders bounded nodes`, `connection, schema and statement survive a reload`, `connection drawer does not displace` (`e2e-focused2.log`); mobile drawer case **re-run after the tab-strip redesign: pass (2.1 s)** |
| Focused axe — axe **4.12.1** (agent-browser vendored engine, same as the 026 audit), wcag2a/aa, fresh browser context | **Light Explain-ready: 0 violations** (`shots/axe-4.12.1-light-explain.json`); incompletes only — `aria-prohibited-attr` (`.cm-theme` label) and `color-contrast` — manual-review, not confirmed defects. **Dark Explain-ready: 0 violations** — the earlier hidden-tab scan (10 near-black nodes) was a measurement artifact: the automated tab was `visibilityState=hidden`/`hasFocus=false` with its CSS animation timeline frozen at 0, yielding stale mixed-theme computed colors; after activating the tab and waiting for visible/settled state, the same source + axe 4.12.1 returned 0 violations (`shots/lead-dark-axe-verdict.json`, lead-produced; `shots/axe-4.12.1-dark-explain.json` retained as superseded diagnostic evidence, not a product defect). `scrollable-region-focusable` not flagged: `.cm-content` now declares `tabindex=0` and real-browser Tab reaches the editor; an overflowing-scroller capture (`scrollW 2139 > clientW 912`) also produced no violation. `aria-required-children` (the lead's earlier single violation) is resolved by the tablist redesign. Incompletes are manual-review limits, not WCAG certification |
| Mobile drawer proof | `main.x=0`, `header.x=0`, `body.scrollWidth=viewport` at 390 px and 320 px after two open/close cycles |
| Three-level doc checker | FE: OK; BE: "no changed files" on the committed tree (semantic module READMEs were updated inside the commit; only gofmt-only directories were excluded from doc churn — a clean-tree result, not a post-hoc content validation) |

## Screenshot review state — all four lead-accepted

| Asset | State |
|-------|-------|
| `docs/screenshots/overview.png` | Lead-accepted |
| `docs/screenshots/resources.png` | Lead-accepted |
| `docs/screenshots/topology.png` | Lead-accepted (recapture: Production environment, real root, 9 nodes / 7 edges, fitView, EN 1600×1000) |
| `docs/screenshots/query-explain.png` | Lead-accepted (native Limit → NestedLoop → 2 IndexScan nodes with cost, Explain text view, EN 1600×1000) |

## Runtime identity used for validation (subsequently cleaned up)

- PG fixture listener `:8080` — pid 50318, binary `vcs.revision=4fb3e9b`,
  `vcs.modified=false`, serving CWD `/tmp/chub-e2e-be` (real clone of
  `fix/review-followups-20261115`; linked-worktree builds lack the VCS stamp).
- BFF proxy `:8081` — pid 52373; Next dev `:3100` — pid 52456.
- Owned disposable containers (run `e2e-review-1794736110`):
  `controlhub-review-meta-e2e-review-1794736110` (metadata MySQL 8.0,
  `127.0.0.1:23317`), `controlhub-review-query-e2e-review-1794736110`
  (`127.0.0.1:13306`), `chub-pg-review-e2e-review-1794736110` (PG 17.10,
  `127.0.0.1:25432`). Old `:8082` demo untouched; old demo containers remain
  stopped and preserved.

After validation, the three owned test listeners were stopped and the three
new containers and their three anonymous volumes were removed through the
owned fixture cleanup paths (`cleanup.log`). Ports 8080, 8081 and 3100 were
free afterwards. Candidate worktrees, the backend clone and evidence remain;
no branch, history, existing stash or old demo volume was deleted.

## Residual / honest notes

- 13 dev-only dependency audit entries remain; see the audit row above —
  not 13 independent runtime advisories, and no claim that every possible
  fix requires force.
- 1 pre-existing TanStack `useReactTable` lint warning remains (library API
  limitation, present at base); not fixed, not suppressed.
- Dark-theme color-contrast: resolved as a measurement artifact, not a
  product defect — see the axe row above (`shots/lead-dark-axe-verdict.json`).
- The implementation-stage local run used focused browser cases rather
  than repeating the Docker integration, OpenAPI fuzz and full browser
  suites locally. Those complete formal gates subsequently ran in GitHub
  CI, with exact runs and results recorded in the publication snapshot.
- Backend semantic READMEs were updated inside commit `4fb3e9b`; the
  post-commit doc checker reports "no changed files" — a clean-tree result,
  not proof of content.
- All artifacts under `/tmp/chub-fix-evidence/`; screenshots in
  `docs/screenshots/` and copied under `shots/` there; axe JSON under
  `shots/axe-*.json`.
- Preservation note: the pre-existing local demo runtime (`:8082`), the
  stopped old `controlhub-demo-*` containers and their **named volumes**, the
  daily local MySQL on `:3306`, and production PostgreSQL defaults were all
  left unchanged — only disposable `e2e-review-1794736110` resources were
  created for this proof.
