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

```bash
npm install
npm run dev
```

The frontend connects to the ControlHub backend API. Set the environment variable to point to your backend:

```bash
# Required: backend API base URL
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

If `NEXT_PUBLIC_API_BASE_URL` is not set, it defaults to `http://localhost:8080`.

The backend must be running and serving the following endpoints:

- `POST /auth/login` — authentication
- `GET /resources` — resource list
- `GET /resources/{id}` — resource detail
- `GET /resources/{id}/relations` — resource relations
- `GET /resources/{id}/audit-events` — resource audit events
- `GET /audit-events` — global audit events
- `GET /environments` — environment list
- `GET /owners` — owner list
- `GET /roles` — role list

All endpoints use JSON with camelCase field names. See the OpenAPI spec at `internal/openapi/openapi.yaml` in the backend repository for the full contract.

## Verification

```bash
npx vitest run
npm run build
npm run lint
```

## Contract assumptions

- Wire types in `types/*.ts` align with the OpenAPI camelCase contract
- View-model fields such as `environmentName`, `ownerName`, `actorLabel`, `targetResourceName`, `summary`, and `profile` are frontend-only presentation fields derived in `lib/view-models.ts`
- The backend does not provide `actorName`, `targetResourceName`, `ownerName`, or `environmentName` in its endpoints
- Supporting dictionaries (resourceType, lifecycleStatus, healthStatus values) are local static data in `services/settings.ts`
