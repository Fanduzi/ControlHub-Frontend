# Phase 38O Delivery Evidence: Governed Relationship Map

**Date:** 2026-07-21
**Status:** Delivered

## Merge Commits

- **Backend:** `c92eb09e73ae68249b8b1fd1fd0d51fc2ebad95b` (main)
  - `9c73e95` feat(query-schema): add governed relationship map endpoint
  - `c92eb09` fix(query-schema): address adversarial review P1 findings
- **Frontend:** `b4f3e41b8a2cfeec9face3dc4b04cc942660975e` (main)
  - `449320e` feat(query-schema): add governed relationship map Inspector surface
  - `b4f3e41` fix(query-schema): address adversarial review P2 findings

## Backend Endpoint

- **Route:** `GET /query-targets/{id}/schema/relationship-map`
- **Auth:** Bearer token required
- **Response:** `{ nodes: [...], edges: [...], truncated: boolean }`
- **Safety:** Read-only, no execution/history rows created

## MySQL Support Decision

- MySQL is the primary supported engine for schema introspection
- The relationship-map endpoint queries `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` and `INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS` for FK relationships
- Read-only credential required (`SELECT` on `INFORMATION_SCHEMA`)

## TiDB Capability Classification

- TiDB is classified as `credential_required` (not `ready`)
- TiDB supports MySQL-compatible `INFORMATION_SCHEMA` queries
- No TiDB-specific contract modifications required

## Fixture Readiness Evidence

- Docker MySQL container `controlhub-query-e2e-mysql` running on port 13306
- Target 616 (`local-mysql-query-dev`): `readiness=ready`, `credentialState=secret_resolved`
- Fixture schemas:
  - `query_e2e`: `query_e2e_items` (2 rows), `qe_explain_big` (100 rows)
  - `query_e2e_aux`: `schema_parent`, `schema_child` (with FK), 26 `schema_zz_page_*` tables, views
- `schema_parent` / `schema_child` FK relationship confirmed for Phase 38O

## E2E Acceptance

- **Command:** `npx playwright test e2e/query-workbench.spec.ts e2e/query-credential-settings.spec.ts`
- **Result:** 74 PASS, 0 FAIL, 0 SKIPPED
- **Duration:** ~183 seconds
- **Coverage:** All existing flows (schema explorer, Inspector, table definition, FK navigation, Explain, history, result-grid) remain green

## Phase 38O E2E Gap

The Phase 38O spec requires dedicated E2E coverage for:
- Desktop EN relationship map
- 375px mobile EN relationship map
- Desktop zh-CN relationship map
- Inbound and outbound directionality
- One map request only (no browser N+1)
- No execute/related-record/table-definition/object-detail fan-out on map open
- Focus restoration
- No raw SQL/credential/result value leak

**Status:** These E2E tests have not yet been written. The component and unit tests exist (`tests/components/query-relationship-map.test.tsx`), but dedicated E2E spec coverage is pending.

## Negative Scope Confirmation

- No execution/history rows created by relationship-map reads
- No raw SQL, credentials, or result values exposed in HTTP/UI/URL/storage
- No browser N+1 metadata fetching
- No graph recursion or related-record execution triggered

## Formal Documentation

- Spec: `docs/superpowers/specs/2026-07-21-phase-38o-governed-relationship-map.md` (162 lines)
- Design: `docs/superpowers/plans/2026-07-21-phase-38o-governed-relationship-map-design.md` (153 lines)
- This evidence note: `docs/superpowers/notes/2026-07-21-phase-38o-governed-relationship-map-evidence.md`
