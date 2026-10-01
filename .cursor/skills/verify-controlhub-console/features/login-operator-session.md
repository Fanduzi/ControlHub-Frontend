# Login / Operator Session

Operator signs in at `/login` with email/password; the BFF establishes a same-origin session via `POST /api/operator-session` and proxies API calls through `/api/proxy/[...path]`. Success lands on `/overview`.

## Sub-features

- `login-form` — `#email` + `#password` + `button[type="submit"]` on `/login`.
- `session-gate` — unauthenticated `/` or `/overview` redirects through the login gate.
- `locale-cookie` — optional `controlhub.locale=en` on domain `localhost` (E2E harness sets this).
- `login-success-url` — after submit, URL matches `/\/overview/`.

## How to get to it (user POV)

- Open `http://localhost:3000/login` (or root `/`, which redirects toward `/overview` then gate → login).
- Enter operator email and password; submit the form.
- Expect the console shell (nav/`aside`) on `/overview`.

## Driving it with Playwright

Preconditions: baseline doctor OK; FE on `:3000`; BE healthy; credential files exist at `/workspace/controlhub-qa-login.email` and `/workspace/controlhub-qa-login.pass`.

- Preferred helper: `.cursor/skills/verify-controlhub-console/scripts/drive-login.sh` → evidence `${EVIDENCE_DIR}/login-overview.png`, `${EVIDENCE_DIR}/login-result.txt`.
- Manual one-shot (same selectors as `e2e/login.spec.ts` / `e2e/harness/auth.ts`):
  - `page.goto("/login")` (baseURL `http://localhost:3000`)
  - `page.locator("#email").fill(<email from file>)`
  - `page.locator("#password").fill(<password from file>)`
  - `page.locator('button[type="submit"]').click()`
  - `expect(page).toHaveURL(/\/overview/)`
- E2E alternative: `npm run test:e2e` / login specs on `:3100` only when `E2E_FIXTURE_ADMIN_*` are set — not the QA files alone.

## Gotchas

- Curl against BE `POST /auth/login` alone does **not** prove the console BFF session path.
- Do not log or screenshot password values; never write credential contents into skill trees.
- Playwright Chromium missing → install with `npx playwright install chromium` (drive-login fails loudly with this hint).
- `:3000` manual Origin must match `.env.local`; E2E uses `:3100` with wrapper-set `CONTROLHUB_BFF_CONSOLE_ORIGIN`.
- Retired seeds `admin@example.com` / `secret123` are refused by `e2e/harness/fixtures.ts`.
