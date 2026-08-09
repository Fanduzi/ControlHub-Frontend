# ControlHub Frontend

Phase 1 frontend for the unified resource console. The app is built with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui primitives, TanStack Table, React Hook Form, Zod, and Vitest.

## Product shell

- Shared `AppShell` across overview, resources, CMDB, databases, audits, and settings
- Dense table-first layout with right-side detail sheets for list interactions
- Full `/resources/[id]` page for deeper inspection
- One accent color, border-led separation, minimal shadow usage

## Routes

- `/login`
- `/overview`
- `/resources`
- `/resources/[id]`
- `/cmdb`
- `/databases`
- `/audits`
- `/settings`

## Console BFF (Operator Sessions)

Phase 38X-1C establishes a same-origin Console BFF boundary. Interactive login
goes through the BFF, which calls the backend login API server-side and seals
the Backend Bearer Credential into an HttpOnly Operator Session cookie
(`controlhub.operator-session`, `SameSite=Strict`, eight-hour maximum age,
AES-256-GCM with an active key plus a short previous-key rotation window). The
protected proxy at `/api/proxy/[...path]` forwards requests using only the
server-held credential and rejects client-supplied `Authorization` headers and
unsafe cross-origin requests. Browser JavaScript never receives a Backend
Bearer Credential. The legacy browser token path remains as a temporary
compatibility seam until the Phase 38X console migration.

### BFF environment

| Env var | Required | Meaning |
|---------|----------|---------|
| `CONTROLHUB_BFF_SESSION_KEY` | yes | Active 32-byte sealing key (64 hex chars or 44 base64 chars) |
| `CONTROLHUB_BFF_PREVIOUS_SESSION_KEY` | no | Previous key accepted during the short rotation window |
| `CONTROLHUB_BFF_CONSOLE_ORIGIN` | yes | The single configured Console Origin (for example `http://localhost:3100`) |
| `CONTROLHUB_BFF_SECURE_COOKIES` | no | `true` (default) or `false`; `false` is the explicit local-development non-Secure exception and is rejected in production |

Production startup (`next start`) fails closed when any of these are missing,
malformed, or unsafe, or when a non-Secure cookie policy is requested; see
`instrumentation.ts`. Route handlers also refuse BFF traffic with a generic
`503` until the configuration is valid.

## Local development

### Node runtime

The frontend requires Node `22.22.0`. The root `.tool-versions` file is the
single checked-in version source used by local asdf and frontend CI; do not add
another Node version file.

Select the locked runtime before installing dependencies:

```bash
asdf install nodejs 22.22.0
asdf local nodejs 22.22.0
node --version
npm run check:runtime
```

After switching Node versions, use a clean lockfile install to repair local
runtime-specific artifacts:

```bash
ASDF_NODEJS_VERSION=22.22.0 npm ci
```

The `prestart`, `predev`, and `prebuild` hooks run `npm run check:runtime`.
Unsupported Node versions fail before `npm start`, `npm run dev`, or
`npm run build` reaches Next.js or Turbopack.

```bash
npm ci
```

The frontend connects to the ControlHub backend API. Set the environment variable to point to your backend:

```bash
# Required: backend API base URL
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

If `NEXT_PUBLIC_API_BASE_URL` is not set, it defaults to `http://localhost:8080`.

### Running with the backend

1. Start the backend at `http://localhost:8080` (see the backend repository for instructions)
2. `npm run dev`
3. Smoke-test these pages:
   - `/login` — sign in with backend credentials
   - `/overview` — attention queue, posture metrics, environment lanes, recent audits
   - `/resources` — resource table with search/filter and detail sheet
   - `/resources/[id]` — full detail page for a known resource ID
   - `/cmdb` — configuration maintenance table
   - `/databases` — database instance and cluster view
   - `/audits` — audit event table and recent timeline
   - `/settings` — environments, owners, roles, and dictionaries

### When the backend is unavailable

All console pages show a readable error state with a retry button instead of crashing with a stack trace. The login page displays a clear message when the backend cannot be reached.

The backend must be running and serving the following endpoints:

- `POST /auth/login` — authentication
- `GET /resources` — resource list
- `GET /resources/{id}` — resource detail
- `GET /resources/{id}/profile` — typed resource profile projection
- `GET /resources/{id}/relations` — resource relations
- `GET /resources/{id}/audit-events` — resource audit events
- `GET /audit-events` — global audit events
- `GET /environments` — environment list
- `GET /owners` — owner list
- `GET /roles` — role list
- `POST /query-targets/{id}/execute` — governed read-only execution with optional result paging for SELECT statements

All endpoints use JSON with camelCase field names. See the OpenAPI spec at `internal/openapi/openapi.yaml` in the backend repository for the full contract.

### Governed query result paging

The query workbench sends the optional `pagination` object on
`POST /query-targets/{id}/execute` for bare `SELECT` statements. It sends a
1-based `page` and a `pageSize` of 10, 25, 50, or 100. The server owns the page
window and effective row cap, and applies governance again for every page. The
browser never rewrites SQL.

The page response reports the page, page size, and adjacent-page flags. It does
not provide totals or snapshot identifiers. Each page is a fresh execution.
Result rows are not persisted, and the frontend does not assume a stable
snapshot between page requests.

`SHOW`, `DESCRIBE`, and typed `EXPLAIN` remain single-response metadata
statements. Supplying pagination does not split those responses or add page
navigation metadata.

The page-size preference is stored locally under
`controlhub.query.result-page-size`. Supported values are 10, 25, 50, and 100.
This preference contains no query data or connection details.

### Governed template execution

Loading a parameterized saved statement enters template mode: the worksheet
shows the typed parameter form and a template-mode banner, and Run and every
page use `POST /query-targets/{id}/saved-statements/{statementId}/execute`.
The request carries only typed `values` (strings/decimals as JSON strings,
integers as JSON integers, booleans as JSON booleans), an optional `maxRows`
cap, and an optional governed `pagination` object — never SQL text, parameter
declarations, actor identity, credentials, or DSNs. The server re-reads and
authorizes the latest saved statement for every execution and page.

Parameter values live only in worksheet memory: they are retained across local
and controlled execution errors, and are discarded on worksheet switch,
refresh, or sign-out. Controlled per-field errors (`missing`, `unknown`,
`invalid`, `oversized`) are localized in English and zh-CN and never echo the
supplied value. Editing or formatting the SQL exits template mode and restores
ordinary ad hoc execution through `POST /query-targets/{id}/execute`. Static
saved statements (empty parameter list) keep their existing load-and-edit
behavior.

### Schema explorer object search

Object search in the schema explorer is debounced auto-search: typing in the
search input triggers a server-side `q` search 250ms after the last keystroke.
There is no submit button. A clear icon appears while the input is non-empty
and resets the listing to the unfiltered first page.

## Verification

```bash
npx vitest run
npm run build
npm run lint
```

## Contract assumptions

- Wire types in `types/*.ts` align with the OpenAPI camelCase contract
- View-model fields such as `environmentName`, `ownerName`, `actorLabel`, `targetResourceName`, and `summary` are frontend-only presentation fields derived in `lib/view-models.ts`
- Resource `profile` content is fetched from `GET /resources/{id}/profile` and normalized into frontend-friendly string values in `lib/view-models.ts`
- The backend does not provide `actorName`, `targetResourceName`, `ownerName`, or `environmentName` in its endpoints
- Supporting dictionaries (resourceType, lifecycleStatus, healthStatus values) are local static data in `services/settings.ts`
- Result paging is a server-governed request contract. The UI stores only the local page-size preference and never stores result snapshots or result rows as a paging mechanism.
