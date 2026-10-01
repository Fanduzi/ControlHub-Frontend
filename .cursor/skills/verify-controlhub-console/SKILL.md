---
name: verify-controlhub-console
description: "Drive the ControlHub operator console (Next.js UI on :3000) the way a QA/agent user does — login, overview, resources, databases, query workbench. Use when proving console behavior, regression-checking a release, or after changing those surfaces."
---

# Verify ControlHub Console

Project-local control skill for `/workspace/ControlHub-Frontend`. Written for an agent reading it cold mid-task.

**Primary surface:** web UI at `http://localhost:3000` (manual `npm run dev`; BFF Origin from `.env.local`).  
**Also:** Playwright E2E on `:3100` + api-proxy `:8081` (`npm run test:e2e*`), CDP release smoke (`npm run release:smoke:cdp`).  
**Not covered here:** editing Vitest unit tests as the proof path, or claiming E2E fixtures from QA login files without exporting `E2E_FIXTURE_ADMIN_*`.

Backend API must already be healthy at `http://127.0.0.1:8080` (`GET /health` → `{"status":"ok"}`). Metadata MySQL must listen on `127.0.0.1:3318`. This skill starts the FE only; it never kills BE/MySQL.

## Launch

```bash
export PATH="/workspace/toolchains/node-22.22.0/bin:$PATH"
export RUN_ID="manual-$(date +%Y%m%d-%H%M%S)"
cd /workspace/ControlHub-Frontend
# npm ci once if node_modules is missing
eval "$(.cursor/skills/verify-controlhub-console/scripts/ensure-stack.sh)"
.cursor/skills/verify-controlhub-console/scripts/doctor.sh
```

Ready when: `doctor.sh` prints `doctor OK`, `http://localhost:3000/login` responds, and BE `/health` is ok.

`ensure-stack.sh` writes `RUN_DIR=/tmp/controlhub-console-verify/$RUN_ID` with `evidence/`, records FE pid only if **this run** started `npm run dev`, and refuses to double-drive a shared `:3000` session owned by another verify run without matching `RUN_ID` isolation.

Port duality (do not mix Origins without updating BFF env):

| Port | Role |
|------|------|
| `3000` | Manual QA console (`.env.local` → `CONTROLHUB_BFF_CONSOLE_ORIGIN=http://localhost:3000`) |
| `3100` | Playwright E2E Next server (`e2e/harness/dev-server-wrapper.sh`) |
| `8081` | E2E `api-proxy.mjs` |

Teardown: `.cursor/skills/verify-controlhub-console/scripts/cleanup.sh` (keeps `${RUN_DIR}/evidence`).

## Doctor

```bash
.cursor/skills/verify-controlhub-console/scripts/doctor.sh
```

Answers: Node toolchain on PATH (`v22.22.0`), `.env.local` present, FE `/login` responds, BE `GET http://127.0.0.1:8080/health` → `{"status":"ok"}`. Re-run whenever anything looks off before blaming a feature.

## Drive

Harness = Playwright Chromium against the manual console on `:3000` (preferred for QA operator login), or the repo's `npm run test:e2e:smoke` on `:3100` when E2E fixtures are provisioned.

Stable handles (quoted from e2e sources — do not invent):

| Surface | Handle |
|---------|--------|
| Login | `page.goto("/login")`, `#email`, `#password`, `button[type="submit"]` → URL `/\/overview/` |
| Overview | `aside` + `h1` (zh `共享资源的运行态势` / en `/Operational posture/i`); prefer `goto /overview?environment=prod` |
| Resources | `goto /resources?environment=prod` or `a[href^="/resources"]` → `h1` (zh `统一资源清单` / en inventory) → `table`; sheet `[data-slot="sheet-content"]` |
| Databases | `goto /databases?environment=prod` or `a[href^="/databases"]` → `h1` (zh `数据库集群与实例` / en) → `table` |
| Query | `goto /query` or `a[href^="/query"]`; connections button (zh/en); `.cm-content` may be absent until a target is ready; execute needs query-dev fixtures |
| Auth files | email `/workspace/controlhub-qa-login.email`, password `/workspace/controlhub-qa-login.pass` (**paths only**) |

One-shot login + overview screenshot:

```bash
.cursor/skills/verify-controlhub-console/scripts/drive-login.sh
# evidence: ${EVIDENCE_DIR}/login-overview.png + login-result.txt
```

If Playwright Chromium is missing, the script fails loudly with: `npx playwright install chromium`.

E2E smoke (separate path — needs `E2E_FIXTURE_ADMIN_*`; QA files alone are **not** wired unless exported):

```bash
npm run check:e2e-preflight
npm run test:e2e:smoke
```

Feature recipes live under `features/`. Read `features/README.md` first, then the matching feature file.

## Evidence

- Location: `${RUN_DIR}/evidence/` (also exported as `EVIDENCE_DIR`). Survives `cleanup.sh`.
- UI proof: Playwright screenshot + URL after action; optional page text snippets.
- HTTP gate: BE health JSON; never log JWT / session cookies / password file contents.
- Standards: drive the real operator path (browser/BFF), not Vitest internals. Capture action + resulting URL/heading. Do not embed secrets in evidence filenames or stdout beyond redacted status lines.

## Cleanup

```bash
.cursor/skills/verify-controlhub-console/scripts/cleanup.sh
```

Kills only the FE PID in `${RUN_DIR}/fe.pid` if this run started it. **Never** `pkill` BE/MySQL/node by process name. Never deletes `${RUN_DIR}/evidence`.

## Helpers

All under `.cursor/skills/verify-controlhub-console/scripts/`:

| Script | Purpose |
|--------|---------|
| `ensure-stack.sh` | Check MySQL `:3318` + BE `:8080`; start FE on `:3000` if needed; print exports for `RUN_DIR` |
| `doctor.sh` | Read-only readiness (FE login page, BE health, node, `.env.local`) |
| `drive-login.sh` | Playwright one-shot login with QA credential **paths** → screenshot overview |
| `cleanup.sh` | Kill only this run's FE pid; keep evidence |

Invoke from repo root with paths as shown above, after `eval "$(.../ensure-stack.sh)"`.

## Auth / secrets

- Read credentials from `/workspace/controlhub-qa-login.email` and `/workspace/controlhub-qa-login.pass` at drive time.
- **Never** copy password/token/JWT into skill files, scripts, or evidence logs.
- E2E fixtures (`E2E_FIXTURE_ADMIN_EMAIL` / `E2E_FIXTURE_ADMIN_PASSWORD`) ≠ QA login files unless the agent explicitly exports QA values into those env names (and must not use retired `admin@example.com` / `secret123` shapes).
