# Overview

Post-login landing page for operational posture. Confirms the authenticated console shell (shared `AppShell`) is up and showing posture summaries.

## Sub-features

- `posture-heading` — page `h1` present. Default locale (zh-CN) shows copy like `共享资源的运行态势`; English E2E (`controlhub.locale=en`) uses `/Operational posture/i`.
- `shell-aside` — `aside` navigation present in the authenticated shell.
- `resource-posture` — posture cards/sections under the shell (locale-dependent copy; do not hard-require English `Resource posture` on default zh-CN).
- `env-scoped` — optional `?environment=prod` (seeded slug; not the word `production`).

## How to get to it (user POV)

- Sign in (see login-operator-session), or open `http://localhost:3000/overview` while already authenticated.
- Root `/` redirects to `/overview`.

## Driving it with Playwright

Preconditions: logged-in session on `:3000` (or drive-login just succeeded).

- Prefer `page.goto("/overview?environment=prod")` after login (nav links carry `?environment=…`, so exact `a[href="/overview"]` may miss).
- Assert `aside` + non-empty `h1` (match zh **or** en). English-only regexes match E2E with `controlhub.locale=en`, not the default QA console.
- Evidence: `${EVIDENCE_DIR}/overview.png` and `${EVIDENCE_DIR}/overview-url.txt` (include observed `h1=`).

## Gotchas

- Without a session you bounce to login; do not treat the login page heading as overview proof.
- Env query uses slugs `prod` / `staging` / `dev` — never invent `production`.
- Assert BE health first if the page is empty or errors.
