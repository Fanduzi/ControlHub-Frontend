# Review follow-ups — 2026-11-15

Local review follow-up record for the `fix/review-followups-20261115` work
packets (frontend worktree `/tmp/chub-fix-fe`, backend companion pin
`4fb3e9bd00445711dd991b68326ec13e5bfa7005` / tree
`7e0471c70d8feb29deeef3d8579a193f358143f5` — a local commit on
`fix/review-followups-20261115`, immutable main-descendant E2E pin).

**Status: ready for human review — local candidates, not pushed, not merged,
not CI-validated.** Both repositories use `fix/review-followups-20261115`;
no remote CI claim is made below.

Base refs: backend `0fa8c43c8223da6b83dbb34856f0bd7160a860e9`, frontend
`897d5c93e82aeb3c49a3a27fb701cb3e8f904cef`. Root `main` checkouts and the
backend's existing dirty paths and stashes were preserved.

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
| P2 filtered-empty vs empty inventory | Implemented: filter-key detection (`q`/`resourceType`/`resourceSubtype`/`lifecycleStatus`/`healthStatus`/`label`/`ownerId`/`archiveFilter`/`includeArchived`/`archivedOnly`) drives specific no-match copy + Clear Filters (preserves environment/pageSize/sort/presentation, resets `page=1`, cancels pending debounced search); unfiltered empty shows scoped inventory copy |

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
  (array-generation PASS).
- **Repo hygiene**: `.gitignore` anchored entries for `/smoke-*.png` and
  `/tpl-*.png` ignore only **root-level** E2E failure/proof captures while
  still allowing nested documentation assets such as `docs/screenshots/`.
- **Fixture hardening**: `pg-fixture-up.sh` launches the disposable listener
  with `CONTROLHUB_PG_HTTP_ENTRIES=on` for this run only and requires a
  VCS-stamped binary (`vcs.revision` equal to the pin, `vcs.modified` not
  true — a real clone when linked-worktree builds lack the stamp);
  `pg-fixture-lifecycle` allocates two distinct `listen(0)` loopback ports
  per test instead of fixed 55439/18099.

## Measured verification

| Check | Result |
|-------|--------|
| `npm ci` (clean, npm 10.9.4 / Node 22.22.0, official registry) | rc=0 (`fe-npm-ci.log`); earlier npm `edgesOut` crash did not recur |
| `release:local` (runtime gate, e2e preflight, governance, controlled-error match vs BE 4fb3e9b, tsc, lint, 2078 unit tests, build) | rc=0 (`fe-release-local2.log`); all counts on vitest 4.1.12 / eslint-config-next 16.2.3 / react-hooks plugin 7.0.1 |
| Subsequent narrow tests (tab-strip redesign) | 330/330 in the two touched component test files; focused lint + tsc clean |
| `npm audit --omit=dev --json` | **0 vulnerabilities** (`fe-audit-prod-only2.json`) |
| `npm audit --audit-level=high` | rc=0 (`fe-audit-high-final2.log`) |
| `npm audit` full | 13 residual dev dependency entries (2 low / 11 moderate) in deepmerge/minimatch/typescript-eslint chains; npm's non-force automatic fix is exhausted and its `--force` proposal would downgrade unrelated framework packages — rejected, not proven to be the only remaining fix (`fe-audit-full-final.json`) |
| ESLint full | 0 errors, 1 warning — pre-existing `react-hooks/incompatible-library` on `useReactTable` (`audit-table.tsx:269`); not fixed, not suppressed (`fe-eslint-full3.log`) |
| Backend `make release-local-gates` | rc=0 on the committed pin (`be-release-local-gates.log`) |
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
- Not run in this task: backend Docker integration suite, full OpenAPI
  fuzz, and the whole Playwright browser suite (focused grep only) — no
  claim of coverage beyond the listed checks.
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
