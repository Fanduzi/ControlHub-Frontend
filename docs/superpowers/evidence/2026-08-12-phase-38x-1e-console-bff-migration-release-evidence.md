# 38X-1E Console BFF migration — release evidence

## Scope

Frontend Issue tracker ticket: ControlHub-Backend #15
Title: 38X-1D Migrate the Console fully to the BFF boundary
Repository: Fanduzi/ControlHub-Frontend
Parent ticket #7 (kept OPEN; not touched by this release).

## Git refs (pre-merge candidate)

| Ref | Full SHA |
|-----|----------|
| Frontend base (`origin/main` at validation) | `c94addd1a6d8aef327796c134775743ea3e18a56` |
| Frontend candidate code HEAD (post-review, P2 fix) | `20e709ac9298f3b1081ab8f723d06bfc40a0ba01` |
| Evidence commits (docs-only, follow the code HEAD) | `b9f618ab008bff15c701ed2dc389db59172a58de`, `92288dd280459f79f0f706b06b54e075847091ff` |
| Backend prerequisite `origin/main` (#19, released) | `1713d8efa48478284d046e279bf9962153349607` |
| Backend migration ceiling verified | 00016 (`00016_disable_seed_users.sql` applied) |

Merge type planned: `git merge --ff-only` of candidate into frontend root `main`.
Push: normal `git push origin main` (no force, no tag, no deploy).

## Changed files (base...candidate)

64 paths (61 files, +1456/−559) under the candidate range, including:

- BFF core: `proxy.ts`, `app/api/operator-session/**`, `app/api/proxy/[...path]/**`, `lib/operator-session/**`
- Product wiring: `app/login/page.tsx`, `services/api-client.ts`, `services/audits.ts`, `lib/auth-role.ts`, `lib/navigation.ts`, `components/app-shell/**`, `components/providers/environment-provider.tsx`, `components/resources/**`
- E2E/CI: `.github/workflows/frontend-ci.yml`, `e2e/**` (incl. deleted `e2e/auth.helpers.ts`, new `e2e/harness/fixtures.ts`, expanded `e2e/operator-session.spec.ts`), `tests/**`
- Docs: root `README.md`, 15 module READMEs, `docs/e2e-governance.md`, this evidence path

## BFF security boundary (verified in code and by tests/E2E)

- Protected page gate (`proxy.ts` middleware) admits only a valid, unexpired
  sealed `controlhub.operator-session` cookie. The legacy browser-readable
  `controlhub.token` is never an auth path; the page gate ignores it and E2E
  proves a legacy token alone is rejected at protected pages.
- Browser API traffic is same-origin `/api/proxy` only. The proxy route:
  rejects client-supplied `Authorization`/`Proxy-Authorization` (400),
  strips `authorization`/`cookie`/`host`/etc. before forwarding, injects the
  server-held Backend Bearer Credential from the unsealed session, blocks
  `/auth*` upstream prefixes, strips upstream `Set-Cookie` and
  `access-control-*`, forces `Cache-Control: no-store`, caps request bodies
  (10 MiB), times out at 30 s, clears the session on upstream 401, and
  requires the exact configured Console Origin for unsafe methods.
- SSR API calls use the same BFF proxy (same-origin self-fetch with the
  forwarded HttpOnly cookie); the browser never sees or sends a Backend
  Bearer Credential. Browser storage/readable-cookie/DOM/network
  no-Bearer assertions pass in E2E.
- Operator Session: AES-256-GCM sealed (v1, key id, 12-byte nonce, auth
  tag), HttpOnly, SameSite=Strict, Path=/, Secure enforced in production,
  fixed eight-hour age, previous-key rotation window, low-entropy key
  rejection, fail-closed config loader (missing/malformed config serves no
  session or proxy traffic).
- Logout is fail-closed: the console clears local role state and navigates
  to `/login` only after the server session DELETE succeeds; on network
  failure it stays on the console and surfaces the localized
  "sign out failed / 退出登录失败" controlled error.
- UI admin affordances are presentation gating only (`useAdminRole`,
  `adminOnly` nav items); the backend remains the authorization boundary.

## Candidate gates (Node 22.22.0 via `.tool-versions`, exact candidate HEAD)

| Gate | Result |
|------|--------|
| `git diff --check c94addd...HEAD` | clean |
| `npm run check:runtime` | pass (Node 22.22.0 exact) |
| `npx tsc --noEmit -p tsconfig.json` | pass (no errors) |
| `npm run lint` | pass (0 errors, 5 warnings) |
| `npm run test` | pass (98 files, 1483 tests) |
| `npm run build` | pass (14/14 static pages) |
| `npm run check:e2e-preflight` | pass (:3100, :8081 free) |
| `npm run check:e2e-governance` | pass (14 spec files scanned) |
| three-level doc check (base...HEAD) | pass (L1 root README, 15 L2 READMEs, L3 headers) |

## Isolated E2E environment and fixture provenance

- Backend: exact `1713d8e` clone in `/tmp/controlhub-backend-e2e` (clean
  checkout, `go build ./...` pass), server on `:18080`. The pre-existing
  service on `:8080` (pre-00016 backend on the `controlhub` fixture DB,
  still accepting the retired seed login) was left untouched.
- Metadata DB: fresh disposable `controlhub_issue15_rel_e2e` on local
  MySQL `127.0.0.1:3306`, goose-migrated to 00016.
- Fixture identities: provisioned by backend `cmd/e2e-fixture-bootstrap`
  (run id `rel1786514964`, mode flag set, disposable `*_e2e` DSN) —
  admin `e2e-admin-rel1786514964@controlhub-e2e.invalid`, editor
  `e2e-editor-rel1786514964@controlhub-e2e.invalid`. Passwords are
  random per run, never printed in this evidence or any log.
- Retired seeds proven inactive: `admin@example.com` / `editor@example.com`
  both `is_active=0` in the migrated DB; `POST /auth/login` with
  `secret123` returns 401 for both. Both fixture identities return 200
  with the correct role.
- Query fixture: query_e2e_aux/query_e2e targets provisioned on local
  MySQL (CI-faithful schema; `query_e2e_ro` SELECT-only user). The
  pre-existing local `query_e2e_aux.schema_child` carried a fifth column
  (`created_at`) not present in the CI schema, so one disclosure-policy
  row for `schema_child.created_at` was added to the disposable metadata
  DB to make the FK-navigation E2E pass. No existing fixture was dropped,
  altered, or disabled; the docker query-e2e fixture on `:13306` was not
  modified.

## Real Chromium E2E (candidate HEAD, isolated environment)

`npm run release:e2e` against the isolated backend (`:18080` via the
`:8081` api-proxy, frontend dev server `:3100`), real Chromium, no mocks,
no route stubs, no skips:

| Run | Tests | Result |
|-----|-------|--------|
| `test:e2e:smoke` | 7 | 7 passed, 0 failed |
| `test:e2e:interaction` | 3 | 3 passed, 0 failed |
| `test:e2e` (full suite) | 176 | 176 passed, 0 failed, 0 skipped |

Totals: **186 passed, 0 failed, 0 skipped** (two consecutive full runs
green; the first full run exposed one environment-only disclosure-policy
gap fixed as above, then rerun clean).

Mandated scenarios covered by `e2e/operator-session.spec.ts` (all green):
desktop EN; 375px EN; desktop zh-CN; legacy `controlhub.token` alone
rejected at protected pages; valid sealed session survives reloads;
no Backend Bearer Credential in browser storage/DOM/readable cookies/
network; logout success rejects protected pages afterwards; logout
network failure keeps the console with the localized controlled error;
forged/tampered/expired session cookies fail closed at the page gate.

## Review

Independent read-only Standards / Spec / Security review of
`c94addd...HEAD` (manual trace of proxy, BFF routes, API client, SSR
callers, logout caller, and fixture harness — GitNexus/CodeGraph index
not used; chain traced by reading the code):

- Standards: three-level doc complete; e2e-governance rules followed
  (loginViaApi removed, console/network guards, failure-only
  screenshots, no forbidden process-output suppression); conventional
  commit messages; header/note conventions.
- Spec: all five #15 acceptance criteria met (BFF-only console traffic,
  legacy bearer storage/request paths removed, reload survival + expiry
  and logout localized feedback, presentation-only UI role, EN/375/zh-CN
  coverage).
- Security: no P1/P2 security findings (client Authorization rejected,
  Origin-gated unsafe methods, credential confined to HttpOnly sealed
  session, fail-closed config, no secrets in code or logs).
- P2 found and fixed: stale "fixture seam not yet on backend main / #15
  cannot release" delivery-status notes in `CLAUDE.md` and
  `docs/e2e-governance.md` (backend #19 is released at `1713d8e`) —
  corrected in candidate commit `20e709a`; full gate suite and full E2E
  rerun green afterwards.

Final review status: **P1 = 0, P2 = 0**.

## Root WIP preservation (frontend root, pre-merge)

Root `main` working tree WIP must survive the ff-only merge byte-for-byte:

- Tracked: `AGENTS.md`, `CLAUDE.md` (root WIP hunk = gitnexus-block
  deletion at base lines 69–112; candidate BFF doc hunks at base lines
  48–69 — verified non-overlapping by hunk-coordinate analysis and by
  successful three-way apply on merge; neither side blocks or overwrites
  the other).
- Untracked: `.codegraph/`, `AGENTS.md.bak-pre-gitnexus-uninstall`,
  `CLAUDE.md.bak-pre-gitnexus-uninstall`, two existing PNG artifacts.
- Baseline manifests recorded at preflight: porcelain output, tracked
  patch hash `8ed8864a…`, untracked manifest hash `fdfb032c…`; content
  hashes captured for every WIP file. Re-verified immediately before
  merge, after merge, and after cleanup.

## Backend isolation

- Backend root `main` (`1713d8e`, clean of the #19 release) left
  untouched apart from read-only inspection; its WIP (CLAUDE.md,
  advisor-plans, untracked docs) untouched. Issue-12 and issue-13
  worktrees, rescue branches, existing services (`:8080`), the docker
  query-e2e fixture (`:13306`), and the existing `controlhub` metadata
  fixture were not modified.
- No DSN passwords, bearer credentials, session keys, fixture secrets,
  or hashes are printed in this evidence or any log.
