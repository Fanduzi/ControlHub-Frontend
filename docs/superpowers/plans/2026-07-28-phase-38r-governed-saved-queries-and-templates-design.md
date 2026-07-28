# Phase 38R: Governed Saved Queries & Shared Templates — Design Document

> Companion to spec: `docs/superpowers/specs/2026-07-28-phase-38r-governed-saved-queries-and-templates.md`

## Architecture Overview

### Backend

```
┌──────────────┐     ┌────────────────────────┐     ┌──────────────────────┐
│  HTTP Handler │────▶│  SavedStatementService  │────▶│  SavedStatementRepo   │
│  (chi routes) │     │  (authorization, guard) │     │  (MySQL, atomic audit)│
└──────────────┘     └────────────────────────┘     └──────────────────────┘
       │                     │
       │            ┌────────┴────────┐
       │            │  QueryGuard      │
       │            │  .GuardSavedStmt │
       │            └─────────────────┘
       │
  ┌────┴──────┐
  │ Middleware  │
  │ FreshActor │
  └───────────┘
```

Key design decisions:
1. **Service layer owns authorization** — token-derived actor/role, never client-supplied.
2. **QueryGuard.GuardSavedStatement** reuses the existing parser + AST walker but returns trimmed text without injecting LIMIT.
3. **Repository wraps mutation + audit in one MySQL transaction** — atomic rollback on audit failure.
4. **No DSN/credential resolution** in any CRUD/list path. `validateTargetExists` uses `ListQueryTargets` which never resolves credentials.

### Frontend

```
┌──────────────────────┐
│  QueryEditorShell     │
│  ┌──────────────────┐ │
│  │ SavedStatements   │ │
│  │ Tab/Panel         │ │
│  └──────┬───────────┘ │
│         │              │
│  ┌──────▼───────────┐ │
│  │ Create Dialog     │ │
│  │ Edit Dialog       │ │
│  │ Delete AlertDialog│ │
│  └──────────────────┘ │
│                       │
│  ┌──────────────────┐ │
│  │ SqlCodeEditor     │ │
│  │ (statement target)│ │
│  └──────────────────┘ │
└──────────────────────┘
        │
  ┌─────▼───────────────┐
  │ query-saved-         │
  │ statements.ts (API)  │
  └─────────────────────┘
```

Key design decisions:
1. **`QuerySavedStatements` is a presentation component** — owns its own fetch/abort/search state, never the worksheet state.
2. **Load enters through `onStatementLoad`** — the parent (`QueryEditorShell`) calls `updateActiveWorksheet({ statement })` which uses the centralized statement-change path.
3. **`canManageSharedTemplates` is server-derived** — the component fetches it from the list API response, overrides the initial prop value.
4. **AbortController pattern** — component-level `abortRef` + `generationRef` for stale response rejection. Target switch triggers `useEffect` cleanup that aborts in-flight requests.
5. **Create dialog** — modal Dialog (desktop) / bottom Sheet (375px) with name input (pre-filled empty), scope selector, and statement preview. Statement is pre-filled from `currentStatement`.
6. **Edit dialog** — same layout but scope is displayed as immutable text, not a selector.
7. **Focus restoration** — trigger button ref stored before open; restored after close/load/delete via `requestAnimationFrame`.

## Component State Model

```
idle ──mount──▶ loading ──success──▶ ready
                   │                    │
                   ├──error────────▶ error ──retry──▶ loading
                   │                    │
                   └──abort────────▶ (stale, ignored)
```

Dialogs are independent state machines:
- **Create**: closed → open (pre-fill SQL) → submit → closed + refetch
- **Edit**: closed → open (load item fields) → submit → closed + refetch
- **Delete**: closed → open (confirm) → delete → closed + refetch
- Focus restored on every close transition.

## Strict Decoding (Backend)

The handler uses `decodeJSONBody` which rejects:
- Unknown JSON fields (decoder `DisallowUnknownFields`)
- Malformed JSON
- Empty body

Additionally, model `Validate()` rejects:
- Empty/oversized/invalid name (control chars, >120 runes)
- Empty/oversized statement (>16 KiB)
- Unknown scope values
- Missing required fields

Query parameter validation:
- Invalid `id`/`statementId` → 400
- Invalid `page`/`pageSize` (non-numeric, negative) → 400
- `q` is a plain string, no validation needed

## Migration Schema

```sql
CREATE TABLE query_saved_statements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_resource_id BIGINT UNSIGNED NOT NULL,
  owner_user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  statement TEXT NOT NULL,
  scope VARCHAR(32) NOT NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  KEY idx_saved_statement_target_scope (target_resource_id, scope, updated_at),
  KEY idx_saved_statement_target_owner (target_resource_id, owner_user_id, updated_at),
  CONSTRAINT chk_saved_statement_scope CHECK (scope IN ('personal', 'shared_template'))
);
```

## Test Strategy

### Backend Unit Tests
- **Model**: scope/name/statement/page validation including Unicode boundaries
- **Guard**: bare SELECT accepted; SHOW/DESCRIBE/typed EXPLAIN/DML/DDL/multi-statement/unsafe rejected; normal Guard unchanged
- **Service**: full actor matrix, immutable scope, target mismatch, nonexistent target, admin cannot read personal
- **Handler**: bearer requirement, strict decoder, no service call on invalid input, token-derived identity, controlled error codes
- **Repository**: migration, target binding, name-only search, order/pagination, atomic rollback on audit failure

### Frontend Unit Tests
- **Service**: URL/body/query shape, error mapping
- **Component**: loading/empty/error states, search debounce, pagination, personal/shared visibility, server-derived affordances, create/edit/delete flows, focus restoration, EN/zh-CN accessible names
- **Load proof**: zero execute/explain/schema/history/related-record/policy calls on load

### Integration Tests
- Two actors, one target, two personal + one shared template
- Exact visibility matrix proof
- No execution/history row from CRUD
- Statement text not in audit payload

### E2E Tests
- Desktop EN: personal save/list/load, shared template listing, focus restoration
- 375px mobile EN: Sheet behavior, same flows
- Desktop zh-CN: translated strings visible
- All with real fixture, no mocks, no forced clicks

## Evidence Tracking

All review artifacts, gate outputs, and E2E totals are preserved in:
- `docs/superpowers/audits/` — Momus and Oracle review artifacts
- `docs/superpowers/notes/` — delivery evidence notes
- CI URLs referenced by exact SHA
