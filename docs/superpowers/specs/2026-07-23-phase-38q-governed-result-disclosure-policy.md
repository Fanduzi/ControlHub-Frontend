# Phase 38Q: Governed Result Disclosure Policy

## Status

Merged; post-merge acceptance blocked. Repair in progress (metadata disclosure P1 fix). Cross-repository governance milestone following Phase 38P
(backend `f0c6d81`, frontend `7a7f6fb`). Establishes a server-owned
result-disclosure contract before any result-grid copy/navigation expansion.

### Repair Invariants (Plan 014)

1. **Literal exemption is strictly no-FROM**: Only `len(statement.From) == 0`
   receives `raw_copy_allowed` without a policy row. `SELECT 1 FROM dual`,
   aliases, and qualified variants are rejected before SQL execution.

2. **Invalid mode fail-closed**: `blocked`, empty mode, unknown values, and
   mode/copy mismatches must return controlled disclosure rejection before
   rows are returned. Valid modes: `raw_copy_allowed` requires
   `copyAllowed=true`; `masked_no_copy` requires `copyAllowed=false`.

3. **Browser contract validation**: Every returned column must have recognized
   internally consistent decisions. No successful column may be `blocked`.
   Every row width must equal columns. Non-null `masked_no_copy` cells must
   equal `[MASKED]` sentinel. Violations replace whole response with localized
   generic error.

4. **Error rendering**: Disclosure errors display only localized fixed copy.
   No `ApiError.message` or `details` may reach the UI for
   `query_result_disclosure_blocked`.

5. **Tracked settings route**: `/settings/query-disclosure-policies` must be
   Git tracked, not merely present in one developer's ignored worktree.

6. **502 diagnosis**: Execute/FK 502s require causal diagnosis. Policy blocks
   return controlled 403 disclosure error, never 502.

## Decision

Every query result column carries a server-owned disclosure decision
(`displayMode` and `copyAllowed`) determined by an exact policy lookup at
`target + database + object + column` scope. The decision is enforced before
SQL execution for blocked columns and applied before JSON serialization for
masked columns. The browser renders only what the server sends; it never
generates a mask, infers sensitivity, or receives a raw value to hide.

## Locked Product Rules

These rules are fail-closed and not open for reinterpretation:

1. **Default blocked**: every result projection without an exact approved
   policy row is `blocked`. The service rejects the query before executing
   SQL and returns a fixed governance error. It does not return a raw value
   and ask the browser to hide it.

2. **Policy owner and scope**: only an administrator may manage persistent
   rules at exact `target + database + object + column` scope. No browser
   request may supply a policy, role, actor, or override. A target-wide
   allow rule is prohibited.

3. **Display modes**: the public result-column contract uses exactly
   `raw_copy_allowed`, `masked_no_copy`, and `blocked`.
   - `masked_no_copy`: the server transforms the value before JSON
     serialization; the browser renders the returned replacement; clipboard
     copy is disabled.
   - `blocked`: rejects the query before execution rather than altering row
     shape by silently omitting a projected column.

4. **Projection boundary**: v1 permits only a single-table direct column,
   qualified direct column, or `*` that the server can expand against the
   governed schema exactly. Expressions, aggregates, joins, subqueries,
   derived tables, ambiguous columns, JSON paths, and UDF output are
   `blocked`. No heuristic name matching is permitted.

   **Literal-only no-FROM exemption**: Pure literal-only no-FROM SELECT
   projections (e.g., `SELECT 1`, `SELECT 'text'`, `SELECT NULL`) are
   intrinsically safe and returned as `raw_copy_allowed` without a
   table-column policy. This narrowly includes AST literal nodes with
   optional aliases. Non-literal expressions (functions, operators,
   variables, subqueries, etc.) remain blocked. Target access, read-only
   SQL guard, row cap, timeout, execution audit, and history remain
   enforced for these queries.

5. **Metadata/non-SELECT blocking**: non-SELECT statements (SHOW, DESCRIBE,
   EXPLAIN, etc.) produce empty projection plans that cannot generate per-column
   disclosure decisions. These are blocked at Preflight before execution.
   Metadata query support requires a separate spec defining statement allowlist,
   risk classification, server-side decision model, and test matrix.

6. **Audit**: preserve the existing governed execution audit. No browser
   copy-audit endpoint exists: clipboard is a local browser action and
   cannot establish a trusted server-side exfiltration record.

## Policy Scope and Precedence

- Scope is exactly four keys: `target_resource_id`, `database_name`,
  `object_name`, `column_name`. A UNIQUE constraint enforces one row per
  scope.
- There is no wildcard, prefix, or regex matching. Absence of a matching
  row means `blocked`.
- `SELECT *` is expanded against live schema metadata; each resolved column
  receives an individual policy lookup.

## Response Contract

Every `QueryResultColumn` in execute and related-record responses includes:

| Field | Type | Description |
|-------|------|-------------|
| `displayMode` | `raw_copy_allowed \| masked_no_copy \| blocked` | Server-owned disclosure decision |
| `copyAllowed` | `boolean` | Whether the cell value may be copied to clipboard |

## Unsupported Projection Behavior

Any projection that cannot be resolved to a direct single-table column
fails closed as `blocked` before SQL execution. This includes:

- Expressions (`email || name`, `UPPER(col)`)
- Aggregates (`COUNT(*)`, `SUM(amount)`)
- Joins (explicit and implicit multi-table FROM)
- Subqueries and derived tables
- JSON path extractions
- UDF output
- Ambiguous column references
- CTEs

**Literal-only no-FROM exemption**: Pure literal-only no-FROM SELECT
projections (e.g., `SELECT 1`, `SELECT 'text'`, `SELECT NULL`) are
exempted as intrinsically safe and returned as `raw_copy_allowed` without
a table-column policy. Non-literal FROM-less expressions (e.g.,
`SELECT 1+1`, `SELECT NOW()`) remain blocked.

## Related-Record Behavior

Related-record navigation uses service-owned FK metadata (not browser-supplied
source info) and passes through the same disclosure enforcement as normal Run:

- Preflight blocks before the executor is called.
- Masking is applied before JSON serialization.
- Masked FK columns disable frontend navigation with a localized reason.

## No-Copy-Audit Rationale

Clipboard copy is a local browser action. A browser-reported copy event
cannot establish a trusted server-side exfiltration record because the
browser can lie, omit, or replay events. A future export or approval design
must introduce its own trustworthy audit boundary.

## MySQL Support

Phase 38Q supports MySQL only. The projection resolver uses the Vitess SQL
parser (MySQL dialect), identifier quoting uses backtick semantics, DSN
parsing uses `mysql.ParseDSN`, and the migration uses MySQL-specific syntax.
No abstraction layer exists that would silently enable other engines. Every
future query engine must explicitly implement the disclosure boundary.

## Explicit Non-Goals

- CSV/JSON/export/download, copy-all, row-range copy, clipboard history
- Browser-only redaction or masking
- Name-based sensitivity classification (e.g., masking every `email` column)
- Client SQL parsing or browser SQL parser
- Actor/role request fields from the browser
- Credential/DSN exposure
- Changes to Object Explorer, Explain, relationship-map, or history behavior
- Query guard widening or write/DDL execution
- Empty string or metadata-mode displayMode (P1 bypass, fixed 2026-07-26)

## Migration

`migrations/00012_governed_result_disclosure_policy.sql` creates the
`query_result_disclosure_policies` table with:

- Auto-increment primary key
- Four scope columns with a UNIQUE constraint
- `mode` column with CHECK constraint (`raw_copy_allowed`, `masked_no_copy`)
- Timestamps with microsecond precision
- utf8mb4_bin collation for exact matching

Absence of a row means `blocked` (fail-closed default).

## Test Matrix

| Layer | Coverage |
|-------|----------|
| Backend model | Policy validation, mode enum, scope fields |
| Backend service | Preflight block before executor, masking before serialization, projection resolution, unsupported forms fail closed, rows:[] invariant |
| Backend handler | Admin-only CRUD, unknown field rejection, error mapping |
| Backend integration | Real MySQL direct projection + related-record under policy |
| Backend OpenAPI | Contract validation, fuzz |
| Frontend types | Enum handling, column disclosure fields |
| Frontend component | Clipboard prohibition for masked, FK nav disabled, ARIA labels, keyboard nav preserved |
| Frontend service | Error code mapping for disclosure-blocked |
| E2E | Desktop EN, mobile EN, zh-CN, one-request boundary, no value leak, no export |

## Release Gates

- All backend gates: `go test`, `go vet`, `gofmt`, `make openapi-validate`,
  `make test-integration`, `make test-openapi-fuzz`
- All frontend gates: `tsc --noEmit`, `npm run lint`, `npm run test`,
  `npm run build`, `npm run check:e2e-preflight`, `npm run check:e2e-governance`
- E2E: three consecutive runs with 0 failed, 0 skipped
- Independent adversarial review: no unresolved P1/P2
- Fast-forward merge only, normal push, required CI green
