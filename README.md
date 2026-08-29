# ControlHub Frontend

Phase 1 frontend for the unified resource console. The app is built with Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui primitives, TanStack Table, React Hook Form, Zod, and Vitest.

## Product shell

- Shared `AppShell` across overview, resources, CMDB, databases, audits, and settings
- Dense table-first layout with right-side detail sheets for list interactions
- Full `/resources/[id]` page for deeper inspection
- Resource create/edit/detail flows manage immutable origin, aliases, and external identifiers
- One accent color, border-led separation, minimal shadow usage

## Routes

- `/login`
- `/overview`
- `/resources`
- `/resources/[id]`
- `/cmdb` — retained bookmark notice linking to `/resources`
- `/databases`
- `/audits`
- `/settings`

Unmatched routes use the localized root `app/not-found.tsx` boundary. Missing
or archived resource detail IDs use the console-localized boundary at
`app/(console)/resources/[id]/not-found.tsx` and link back to `/resources`.

## Console BFF (Operator Sessions)

Phase 38X-1C establishes a same-origin Console BFF boundary. Interactive login
(`app/login`) posts to `/api/operator-session`, which calls the backend login
API server-side and seals the Backend Bearer Credential into an HttpOnly
Operator Session cookie (`controlhub.operator-session`, `SameSite=Strict`,
eight-hour maximum age, AES-256-GCM with an active key plus a short
previous-key rotation window of 15 minutes). The login and session responses
return trusted operator identity and role — never a bearer token. Browser client fetches without client Authorization use `/api/proxy/[...path]`, which attaches the server-held credential and
rejects client-supplied `Authorization` headers, blocked prefixes such as
`auth/*`, and unsafe cross-origin requests. The console route guard (`proxy.ts`)
accepts a valid unexpired Operator Session; forged, tampered, unknown-key, or
expired cookies fail closed to login. UI sign-out is fail-closed: the console
leaves for `/login` only after the BFF confirms the session cookie is cleared;
a failed logout (network or non-2xx) keeps the operator in the console with a
controlled error instead of presenting a logged-out UI while the session survives.
There is no open `/__api` rewrite to the backend; browser API access is only via `/api/proxy`.
Admin presentation gates read the same-origin sealed-session response and do not
trust browser storage or readable role cookies.

### BFF environment

| Env var | Required | Meaning |
|---------|----------|---------|
| `CONTROLHUB_BFF_SESSION_KEY` | yes | Active 32-byte sealing key (44 base64 chars; hex encoding rejected) |
| `CONTROLHUB_BFF_PREVIOUS_SESSION_KEY` | no | Previous key accepted during the short rotation window (base64 only) |
| `CONTROLHUB_BFF_CONSOLE_ORIGIN` | yes | The single configured Console Origin (HTTPS required in production; HTTP allowed only in local development, for example `http://localhost:3000`, matching `npm run dev`) |
| `CONTROLHUB_BFF_SECURE_COOKIES` | no | `true` (default) or `false`; `false` is the explicit local-development non-Secure exception and is rejected in production |

Production startup (`next start`) fails closed when any of these are missing,
malformed, or unsafe, or when a non-Secure cookie policy is requested; see
`instrumentation.ts`. Route handlers also refuse BFF traffic with a generic
`503` until the configuration is valid. Key material with a short repeating
pattern (periods 1–16 bytes) is rejected; this is a structural check, not an
entropy proof.

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

The console browser always uses same-origin `/api/proxy`; `NEXT_PUBLIC_API_BASE_URL`
is not a browser authentication or routing setting.

### Running with the backend

Start an isolated backend and configure the BFF server target:

```bash
export CONTROLHUB_API_BASE_URL=http://localhost:8080
```

The Console Origin port must match the port where the frontend is running.

Then run `npm run dev` and smoke-test these pages:
   - `/login` — sign in with backend credentials
   - `/overview` — attention queue, posture metrics, environment lanes, recent audits
   - `/resources` — resource table with effective status, freshness, observed time, observer, search/filter, and detail sheet
   - `/resources/[id]` — full detail and health-evidence page for a known resource ID
   - `/cmdb` — retained bookmark notice linking to `/resources`
   - `/databases` — database instance and cluster view
   - `/audits` — audit event table and recent timeline
   - `/settings` — environments, owners, roles, and dictionaries

### When the backend is unavailable

All console pages show a readable error state with a retry button instead of crashing with a stack trace. The login page displays a clear message when the backend cannot be reached.

The backend must be running and serving the following endpoints:

- `POST /auth/login` — authentication
- `GET /resources` — resource list
- `GET /resources/{id}` — resource detail
- `POST /resources/{id}/health-observations` — backend collector ingestion contract (admin; observation writes are not inventory-audited)
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

## Architecture

The Next.js App Router renders authenticated console pages. Components keep
presentation state, services own the same-origin JSON boundary, transport
types mirror OpenAPI, and shared libraries normalize URL and view-model state.

### Modules

| Module | Responsibility | Doc |
|--------|----------------|-----|
| app | Routes, layouts, and Console BFF handlers | [README](app/README.md) |
| components/resources | Inventory UI and saved-view controls | [README](components/resources/README.md) |
| lib | URL parsing, view models, session, and shared helpers | [README](lib/README.md) |
| services | Backend API clients | [README](services/README.md) |
| types | Backend transport and frontend view-model contracts | [README](types/README.md) |
| tests | Unit/component/service contracts | [README](tests/README.md) |

## Contract assumptions

- Wire types in `types/*.ts` align with the OpenAPI camelCase contract
- View-model fields such as `environmentName`, `ownerName`, `actorLabel`, `targetResourceName`, and `summary` are frontend-only presentation fields derived in `lib/view-models.ts`
- Resource `profile` content is fetched from `GET /resources/{id}/profile` and normalized into frontend-friendly string values in `lib/view-models.ts`
- Resource list/detail payloads expose effective `healthStatus`, `healthFreshness`, `healthObservedAt`, `healthObserver`, and nullable `manualHealthOverride`; the UI fails closed to `Never · — · —` during a rolling deployment if an older backend omits the new fields
- The backend does not provide `actorName`, `targetResourceName`, `ownerName`, or `environmentName` in its endpoints
- Supporting dictionaries (resourceType, lifecycleStatus, healthStatus values) are local static data in `services/settings.ts`
- Result paging is a server-governed request contract. The UI stores only the local page-size preference and never stores result snapshots or result rows as a paging mechanism.
