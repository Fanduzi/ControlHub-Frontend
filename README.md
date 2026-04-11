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

The current frontend uses mock services in `services/` that mirror the planned backend resource, audit, auth, and settings contracts until the REST API is wired in.

## Verification

Run the phase 1 frontend checks:

```bash
npx vitest run tests/components/sidebar.test.tsx
npx vitest run tests/components/resource-detail-sheet.test.tsx
npx vitest run
npm run dev
```

## Contract assumptions

- `resource_type`, `resource_subtype`, `lifecycle_status`, `health_status`, `relations`, and `audit_events` align with the phase 1 spec naming
- `GET /resources`, `GET /resources/{id}`, and `GET /audit-events` will eventually back the existing service modules
- Auth is still using demo credentials until the backend login contract is available
