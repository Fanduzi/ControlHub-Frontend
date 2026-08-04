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

Run `npm run check:runtime` before diagnosing a build failure. Unsupported
Node versions fail before Next.js and Turbopack start.

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
