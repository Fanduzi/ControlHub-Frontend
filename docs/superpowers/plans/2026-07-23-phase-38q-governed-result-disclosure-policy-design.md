# Phase 38Q Design: Governed Result Disclosure Policy

## Overview

This design implements the locked product decision from the Phase 38Q spec.
It establishes a server-owned result-disclosure boundary that governs every
query result column before it reaches the browser.

## Architecture

```
Browser Request (statement only)
       │
       ▼
┌─────────────────┐
│  Query Guard    │  ← read-only enforcement (unchanged)
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Disclosure Preflight   │  ← NEW: resolves projection, looks up policy
│  (blocks before SQL)    │     per column. Unsupported forms → blocked.
└────────┬────────────────┘
         │ (if not blocked)
         ▼
┌─────────────────┐
│  MySQL Executor │  ← unchanged bounded row scanner
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Disclosure Apply       │  ← NEW: replaces masked values with [MASKED]
│  (before serialization) │     in the service layer, before handler JSON.
└────────┬────────────────┘
         │
         ▼
   JSON Response (displayMode + copyAllowed per column)
```

## Backend Design

### Model (`internal/model/query_disclosure.go`)

- `ResultDisclosureMode`: string enum with three constants
  (`raw_copy_allowed`, `masked_no_copy`, `blocked`).
- `ResultDisclosurePolicy`: persisted row with scope (TargetResourceID,
  DatabaseName, ObjectName, ColumnName) + Mode + timestamps.
- `ResultDisclosurePolicyUpsertRequest`: admin input with scope + mode.
  Validate() accepts only `raw_copy_allowed` and `masked_no_copy` for
  persistence; `blocked` is the implicit default from absence.

### Repository (`internal/repository/mysql/query_disclosure_repository.go`)

- `GetByScope(ctx, targetID, db, object, column)`: exact four-key lookup.
  Returns `sql.ErrNoRows` when no policy exists (fail-closed trigger).
- `ListByTarget(ctx, targetID)`: admin listing.
- `Upsert(ctx, policy)`: INSERT ... ON DUPLICATE KEY UPDATE.
- `DeleteByScope(ctx, targetID, db, object, column)`: exact deletion.

### Service (`internal/service/query_disclosure_service.go`)

- `Preflight(ctx, targetID, statement)`: parses SQL, resolves projection
  sources, looks up policy per column. Returns a `DisclosurePlan` or
  `ErrQueryDisclosureBlocked`.
- `PreflightRelatedRecords(ctx, targetID, db, table, columns)`: uses
  service-owned FK metadata to resolve columns, same plan logic.
- `Apply(plan, columns, rows)`: transforms rows in-place (new slice),
  replacing non-null masked values with `"[MASKED]"`. Sets `displayMode`
  and `copyAllowed` on each column descriptor.

### Projection Resolution (`internal/service/query_disclosure_projection.go`)

- Uses Vitess SQL parser (MySQL dialect).
- Handles only: `StarExpr` (expanded via live schema metadata),
  `AliasedExpr` where inner expr is `ColName` (direct column).
- **Literal-only no-FROM exemption**: Pure literal-only no-FROM SELECT
  projections (e.g., `SELECT 1`, `SELECT 'text'`, `SELECT NULL`) return
  columns with `raw_copy_allowed` without a table-column policy lookup.
  Validates that all SELECT expressions are AST literal nodes (`*Literal`,
  `*NullVal`, `*BoolVal`) with optional aliases. Non-literal expressions
  (functions, operators, variables, subqueries, etc.) are rejected as
  `errProjectionUnsupported`.
- Rejects: multi-table FROM, CTEs, non-AliasedTableExpr, non-TableName
  table expressions, and any non-ColName expression (except literal-only
  no-FROM projections).
- Returns `errProjectionUnsupported` for all unsupported forms.

### Masking (`internal/service/query_disclosure_mask.go`)

- Pure transform: iterates rows, replaces non-null values in masked
  columns with `"[MASKED]"`.
- Only `masked_no_copy` columns are transformed.
- `raw_copy_allowed` columns pass through unchanged.

### Handler (`internal/api/query_disclosure_handler.go`)

- Four endpoints: GET (list), POST (create), PUT (update), DELETE.
- All require `actor.Role == "admin"` (403 otherwise).
- Strict JSON decoding with `DisallowUnknownFields()` rejects any
  actor/role/policy/DSN/secret fields in request bodies.
- Error responses use controlled fixed messages.

### Integration Points

- `query_execution_service.go`: calls `Preflight` after `Guard` and before
  `executor.Query`; calls `Apply` after executor returns and before building
  the response struct.
- Related-record path: calls `PreflightRelatedRecords` after FK validation
  and before executor; calls `Apply` identically.
- Phase 38P invariant preserved: `rows` is always a non-nil slice.

### Migration (`migrations/00012_governed_result_disclosure_policy.sql`)

```sql
CREATE TABLE IF NOT EXISTS query_result_disclosure_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  target_resource_id BIGINT UNSIGNED NOT NULL,
  database_name VARCHAR(64) NOT NULL COLLATE utf8mb4_bin,
  object_name VARCHAR(64) NOT NULL COLLATE utf8mb4_bin,
  column_name VARCHAR(64) NOT NULL COLLATE utf8mb4_bin,
  mode VARCHAR(32) NOT NULL COLLATE utf8mb4_bin,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
    ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (id),
  UNIQUE KEY uq_scope (target_resource_id, database_name, object_name, column_name),
  CONSTRAINT chk_mode CHECK (mode IN ('raw_copy_allowed', 'masked_no_copy'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
```

### OpenAPI Contract

- `QueryResultColumn` schema: adds `displayMode` (enum: raw_copy_allowed,
  masked_no_copy, blocked) and `copyAllowed` (boolean) as required fields.
- `ResultDisclosureMode` schema: enum of the two persistable modes.
- `ResultDisclosurePolicy` schema: full policy row.
- Four CRUD endpoints under `/query-disclosure-policies`.
- Request bodies accept only scope + mode; no actor/role/policy override.

## Frontend Design

### Types (`types/query-disclosure.ts`, `types/query-execution.ts`)

- `ResultDisclosureMode`: union type matching backend enum.
- `QueryResultColumn`: adds `displayMode` and `copyAllowed` readonly fields.
- `DisclosurePolicy`, `DisclosurePolicyUpsertRequest`: admin CRUD types.

### Service Layer (`services/query-disclosure.ts`, `services/query-executions.ts`)

- CRUD functions for admin policy management.
- Error code mapping: 403 + "disclosure_blocked" in message →
  `query_result_disclosure_blocked` error code.

### Result Table (`components/query/query-editor-shell.tsx`)

- `handleCopy()`: checks `column.copyAllowed` before clipboard write.
  Returns early (no-op) for masked/blocked columns.
- Copy button: disabled when selected cell's column has `copyAllowed: false`.
- `copyButtonLabel()`: returns localized "Copy not permitted" for
  non-copyable columns; never includes the raw value in ARIA label for
  masked columns.
- FK navigation eligibility: excludes columns where `copyAllowed` is false,
  preventing masked values from forming navigation input.
- Related-record panel: reuses `ResultTable` with the same disclosure-aware
  column descriptors from the server response.

### Settings UI (`components/settings/query-disclosure-settings.tsx`)

- Admin-only gate using `useAdminRole()` hook.
- Non-admin users see "Managed by administrators" message.
- CRUD form with target/database/object/column/mode fields.
- Success/error toasts use localized messages.

### i18n

- EN and zh-CN messages for: policy settings labels, mode descriptions,
  empty state, admin gate, success/error toasts, result-table indicators
  (copyNotAllowed, maskedIndicator, disclosureBlocked, fkNavigationDisabled),
  and error panel (query_result_disclosure_blocked).

## Security Properties

1. Raw protected values never cross the API boundary for masked/blocked
   columns (server transforms before serialization).
2. No browser-supplied actor/role/policy override (strict decoding rejects
   unknown fields).
3. No heuristic name-based classification.
4. No copy-audit endpoint.
5. No export/download/copy-all/range-copy capability.
6. Unsupported projections fail closed before SQL execution. Pure
   literal-only no-FROM SELECTs are exempted as intrinsically safe.
7. Admin-only policy CRUD at handler layer.
8. Fixed error messages prevent raw value/SQL/DSN leaks.

## Display vs Copy Distinction

- `displayMode` controls what the user sees (raw value, [MASKED], or error).
- `copyAllowed` controls whether the clipboard operation is permitted.
- A raw value is never sent solely to be hidden by the UI.
- The frontend never generates a mask string from a raw value.
