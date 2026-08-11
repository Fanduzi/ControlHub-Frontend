# 38X-1C Console BFF operator session — release evidence

## Scope

Frontend Issue tracker ticket: ControlHub-Backend #14  
Title: 38X-1C Establish same-origin Console BFF sessions  
Repository: Fanduzi/ControlHub-Frontend  

## Git refs (pre-merge candidate)

| Ref | Full SHA |
|-----|----------|
| Frontend base (`origin/main` at validation) | `917b1389977447e6362d309f0fc2967466581232` |
| Frontend candidate HEAD | `46ca9706c067e8316b80b0bca9b5988366f3200a` |
| Backend isolated verification HEAD / `origin/main` | `4bd661db03e344907b07ab499adcdef89af6563a` |

Merge type planned: `git merge --ff-only` of candidate into frontend root `main`.  
Push: normal `git push origin main` (no force, no tag, no deploy).

## Changed files (base...candidate)

52 paths under the candidate range, including:

- BFF core: `app/api/operator-session/**`, `app/api/proxy/[...path]/**`, `lib/operator-session/**`, `proxy.ts`, `instrumentation.ts`
- Product wiring: `app/login/page.tsx`, `services/api-client.ts`, `components/app-shell/topbar.tsx`, `components/providers/**`, `lib/auth-role.ts`, `next.config.ts`
- Tests/E2E: `tests/**`, `e2e/operator-session.spec.ts`, `e2e/query-workbench.spec.ts`, `e2e/query-credential-settings.spec.ts`
- Docs: root `README.md`, module READMEs, this evidence path

## Candidate gates (Node 22.22.0 via `.tool-versions`)

Commands and results on candidate worktree  
`/Users/fan/JsProjects/ControlHub/.worktrees/frontend-38x-1c-console-bff-session` at `46ca9706c067e8316b80b0bca9b5988366f3200a`:

| Command | Result |
|---------|--------|
| `git diff --check 917b1389977447e6362d309f0fc2967466581232...HEAD` | pass |
| `npm run check:runtime` | pass (Node 22.22.0) |
| `npx tsc --noEmit -p tsconfig.json` | pass |
| `npm run lint` | pass (0 errors; pre-existing warnings only) |
| `npm run test` | pass — **96** files, **1459** tests |
| `npm run build` | pass |
| `npm run check:e2e-preflight` | pass (`:3100`, `:8081` free) |
| `npm run check:e2e-governance` | pass (14 spec files) |

## Real BFF / release E2E provenance

### Isolated backend (not root)

| Field | Value |
|-------|-------|
| Worktree CWD | `/Users/fan/GolangProjects/ControlHub-wt-38x-1c-verify-20260811` |
| Binary | `/tmp/controlhub-38x-1c-verify/controlhub-server` built from that worktree |
| SHA | `4bd661db03e344907b07ab499adcdef89af6563a` |
| Listen | `127.0.0.1:18082` (`APP_PORT=18082`) |
| PID | `8413` |
| Health | `GET /health` → `{"status":"ok"}` |
| Why not `:8082` | Pre-existing unrelated fixture PID `41184` already bound `*:8082` (CWD `ControlHub-issue5-38w4`); left untouched per root/fixture preservation rules |
| Playwright target | `PLAYWRIGHT_PROXY_TARGET=http://127.0.0.1:18082` |
| Root services preserved | `:8080` PID `5738` (root-related fixture) not stopped |

### Focused BFF Chromium suite

`env -u NO_COLOR npx playwright test e2e/operator-session.spec.ts --project=chromium`

Coverage exercised: successful BFF login + sealed HttpOnly cookie; invalid credentials → generic 401; protected proxy with server-held credential; client `Authorization` rejected; malicious Origin rejected on unsafe methods; logout clears session and page gate re-requires login; forged/tampered/expired cookie page gate.

Result: **7 passed**, 0 failed, 0 skipped.

### Full release E2E

`PLAYWRIGHT_PROXY_TARGET=http://127.0.0.1:18082 npm run release:e2e`

Result: **170 passed**, 0 failed, 0 skipped (smoke + interaction + full suite).

### Manual production `next start` HTTP checks

- `NODE_ENV=production`, Secure cookies required (insecure cookies fail closed at instrumentation — verified).
- Forged `controlhub.operator-session` → `GET /overview` **307** to `/login?from=%2Foverview` and clears cookie.
- Valid BFF `POST /api/operator-session` → **200** body `{"role":"admin"}` only (no token/Bearer in body).
- Valid sealed session → `GET /overview` **200**; `GET /api/proxy/resources?limit=1` **200** with items; no credential leak in bodies.
- Process stopped after checks; root services retained.

## BFF security matrix (acceptance)

| Control | Status |
|---------|--------|
| Interactive login via same-origin BFF only | pass (`app/login` → `/api/operator-session`) |
| Bearer sealed in HttpOnly `controlhub.operator-session`, SameSite=Strict, 8h max age, AES-GCM | pass |
| Active + previous key with 15-minute previous-key window | pass (unit + seal implementation) |
| Browser never receives bearer (body/storage/readable cookies) | pass |
| Browser client fetches use `/api/proxy` without `Authorization` | pass |
| Proxy rejects client Authorization; blocks `auth/*`; strips upstream `Set-Cookie`; forwards `Location`; forwards 403 bodies | pass |
| Route guard fail-closed for forged/tampered/unknown-key/expired/missing config | pass |
| Production fail-closed for missing/unsafe keys/origin/insecure cookies | pass |
| UI logout calls `DELETE /api/operator-session` | pass |
| No open `/__api` rewrite to backend | pass |
| Legacy `controlhub.token` page-gate seam only (until #15) | residual P3 (documented) |

## Independent reviews (fresh context)

| Axis | Tool | Verdict | P1 | P2 | P3 |
|------|------|---------|----|----|-----|
| Standards | pi-subagents reviewer (fresh) | ITERATE → addressed docs/login accuracy | 0 | 0 remaining after fixes | trailing-doc noise cleared |
| Spec | pi-subagents reviewer (fresh) | ITERATE → login/BFF wiring fixed | 0 | 0 remaining | — |
| Security | pi-subagents reviewer (fresh), final pass after HEAD fixes | ITERATE with P2 `/__api` rewrite → fixed by removing rewrite | **0** | **0** | legacy page-gate seam accepted until #15 |

Final security posture after fixes: **no open P1/P2**.

Accepted residual P3:

1. Legacy non-empty `controlhub.token` still admits the console **page gate** without unseal (`proxy.ts`) until Issue #15 removes the seam. Data plane no longer consumes legacy bearer via `apiClient`.
2. Unbounded login JSON body parse (small public POST) — not fixed in this delivery; rate limits/body caps can follow if abused.

## Three-level documentation

- L3 headers and L2 module READMEs updated for touched modules.
- Checker false positive observed: reports `module changed but README.md not updated: ./README.md` while staged diff **includes** root `README.md` (path normalization `./README.md` vs `README.md`). Actual checker output recorded; README is in the candidate diff. Not treated as a silent pass.

## Root WIP whitelist (must remain unchanged)

### Frontend root (`/Users/fan/JsProjects/ControlHub`)

| Path | sha256 |
|------|--------|
| AGENTS.md | `537222fed176d3bc2f09f97448d856bb99c55bf51b03e17329058fdcb476af65` |
| CLAUDE.md | `f9813a2c5af74c46b50c82ad76044ae075adf8fb3e85df77f3769ab7de749f8d` |
| .codegraph/ | `aba56eb3834d0d0906f413bece4c4b67a4258f38d72f2d3b21d54cebe27b9c91` (4 files) |
| AGENTS.md.bak-pre-gitnexus-uninstall | `93b53ae0fc7310a8c72465e19784bb0525404306ea5396aed0304bedbef5a7bc` |
| CLAUDE.md.bak-pre-gitnexus-uninstall | `7dd27e1ee59c7403f6e69a96c454a0b42ac74762cc5484c9899067dd0a6eb469` |
| shared-tpl-…375px-en….png | `26ff465bef29c2b939ad0d67cd21eade86ab821fdd1a9703030dfb75da390fab` |
| shared-tpl-…desktop-zh-cn….png | `9197233ab694b17d78aae4421eef45366e5e5fd21bf3bc134ac50f9439e6ac7d` |

### Backend root (`/Users/fan/GolangProjects/ControlHub`)

Unchanged dirty set recorded at precheck (CLAUDE.md, advisor-plans/README.md, bak files, CONTEXT.md, docs/agents/, listed decisions/specs/plans). No backend root edits performed.

## CI / merge fields

| Field | Value |
|-------|-------|
| Fast-forward merge range | `917b1389977447e6362d309f0fc2967466581232..bdca6d9b71a844322ac750b54c51ae6ff25b8a38` then CI follow-ups to final tip |
| Final frontend `HEAD` / `origin/main` | `b9303f111beec0c1adea509ce02c02ce45eb45e5` |
| Push | normal `git push origin main` (no force) |
| GitHub Actions run | https://github.com/Fanduzi/ControlHub-Frontend/actions/runs/31467862864 |
| Actions head SHA | `b9303f111beec0c1adea509ce02c02ce45eb45e5` |
| Job `release-local` | success |
| Job `release-e2e` | success |
| Post-merge local gates on merged root | runtime/tsc/lint/unit(1459)/build/governance + `release:e2e` 170 passed |

Follow-up commits after the evidence-bearing delivery tip (still on `main`, included in final SHA):

- `34fd0d65fcc9911fb05561a72917ac49d287c8c4` — explicit proxy `RouteContext` type for bare `tsc`
- `a86a093437713401d344a687ec45118e0f15e6fb` — CI `JWT_SECRET` length
- `4b18c1fd42c9e2fc506bbd47b95203dcce995c6e` — CI bootstrap admin
- `b9303f111beec0c1adea509ce02c02ce45eb45e5` — CI reactivate editor

## Cleanup plan

After independent verifier pass: delete only this task’s frontend candidate worktree/branch `task/38x-1c-console-bff-session` and backend verify worktree `ControlHub-wt-38x-1c-verify-20260811` + temp server PID started for this task. Preserve unrelated worktrees, root WIP, root listeners (`:8080`), and issue5 fixture on `:8082`.
