# ControlHub Console verification map

Maintained source for verifying operator-facing ControlHub console behavior. Read this index before driving, then open the matching feature file.

## Baseline preconditions

- Node toolchain: `export PATH="/workspace/toolchains/node-22.22.0/bin:$PATH"` (expect `v22.22.0`).
- `npm ci` completed under `/workspace/ControlHub-Frontend` when `node_modules` is absent.
- `.env.local` present with non-secret targets: `CONTROLHUB_API_BASE_URL=http://127.0.0.1:8080`, `CONTROLHUB_BFF_CONSOLE_ORIGIN=http://localhost:3000`, `CONTROLHUB_BFF_SECURE_COOKIES=false`.
- Metadata MySQL listening on `127.0.0.1:3318`; Backend `GET http://127.0.0.1:8080/health` → `{"status":"ok"}`.
- `scripts/ensure-stack.sh` evaluated; `scripts/doctor.sh` passes.
- Evidence directory is `${EVIDENCE_DIR}` / `${RUN_DIR}/evidence`.
- Manual console on `:3000` for QA operator login; Playwright E2E uses `:3100` + proxy `:8081` — do not mix BFF Origins.
- Refuse double-driving a shared `:3000` session if another verify run owns the port without this `RUN_ID`'s isolation (see `ensure-stack.sh`).

## Driving conventions

- Start from baseline unless a recipe says otherwise.
- Prefer Playwright selectors quoted in feature files (from `e2e/*.spec.ts` / harness).
- Operator credentials: read from `/workspace/controlhub-qa-login.email` and `/workspace/controlhub-qa-login.pass` (paths only). Never echo contents.
- E2E path requires `E2E_FIXTURE_ADMIN_*` / `E2E_FIXTURE_EDITOR_*` from BE `cmd/e2e-fixture-bootstrap`; QA files alone are not wired into Playwright unless exported.
- Do not remove proof artifacts during cleanup.

## Proof and skip reporting

- UI proof: URL after navigation, visible heading/table selectors, screenshot under `${EVIDENCE_DIR}`.
- Health gate: BE `/health` JSON before blaming console features.
- Record feature ID and entry point with every artifact filename prefix.
- Report unreachable paths with the attempted command and unmet precondition (e.g. MySQL `:3318` closed, Playwright Chromium missing); do not claim a skipped entry point was verified via another path.

## Feature entry contract

Each feature file: H1 + one paragraph, then exactly four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with <harness>`, `Gotchas`.

## Features

- [Login / Operator Session](./login-operator-session.md) — `/login` → BFF session → `/overview`.
- [Overview](./overview.md) — operational posture landing after auth.
- [Resources inventory](./resources-inventory.md) — unified inventory table, detail sheet, detail page.
- [Databases sheet](./databases-sheet.md) — filtered database clusters/instances inventory.
- [Query workbench](./query-workbench.md) — `/query` editor, connections, run, results.

## Locale note (maintain 2026-10-02)

Default manual console on `:3000` is **zh-CN**. E2E smoke often sets `controlhub.locale=en`. Feature recipes must accept either, or set the locale cookie explicitly before asserting English copy.

Sidebar `href`s include `?environment=<slug>` (e.g. `/resources?environment=prod`). Prefer `page.goto` or `a[href^="…"]` over exact `a[href="/resources"]`.

## Not yet mapped (concrete nav paths observed live)

- `/topology?environment=…`
- `/audits?environment=…`
- `/settings`, `/settings/machine-principals` (+ query-credentials / disclosure policies routes in app)

## Ports

Manual verify stack uses FE `:3000` + BE `:8080` + MySQL `:3318`. Checked-in Playwright often uses `baseURL` `:3100` and API proxy `:8081` — use that config for `npm run test:e2e:*`, and `:3000` for skill ensure-stack / live drive.
