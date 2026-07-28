# Phase 38R: Governed Saved Queries & Shared Templates — Product Spec

> Authoritative source: `advisor-plans/015-phase-38r-governed-saved-queries-and-templates.md`

## Status

| Field | Value |
| --- | --- |
| Phase | 38R |
| Date | 2026-07-28 |
| Priority | P1 product workflow gap |
| Risk | High: persists user-authored SQL and adds visibility policy |
| Dependencies | Phase 38Q disclosure enforcement; fresh-query-actor middleware |
| Blocks | Export, parameterized templates, and scheduled execution |

## Objective

Give the Query Workbench a reusable, governed query library: a user saves and later loads **personal saved queries** for one target; an administrator may create and maintain **shared templates** for that same target. It must not become an execution shortcut, a query-text discovery API, or a way to expose another user's private query.

This is intentionally a static statement library. It excludes parameters, variables, exports, schedules, collaboration, public links, folders, versioning, and any new query engine.

## Locked Product Decisions

### Visibility and authority

| Scope | Who can list/load | Who can create | Who can update/delete |
| --- | --- | --- | --- |
| `personal` | Owner only | Authenticated owner | Owner only, including an admin acting as that owner |
| `shared_template` | Any fresh query actor for same target | Admin only | Admin only |

- An administrator **never** gains access to another user's personal saved statement merely by being an admin.
- Scope is **immutable**. Changing personal to shared, or reverse, requires creating a new record.
- Owner ID, actor ID, role, access override, credential, result, policy decision and audit payload are **never** accepted from the browser. Actor identity/role always comes from the verified fresh bearer token.
- Every record has one exact `target_resource_id`; v1 has no global, cluster, engine-wide, or cross-target template.
- List responses **never** expose `ownerUserId` or a template author.

### Content and execution

- Persist only ID, target ID, owner ID, trimmed name, original trimmed statement, immutable scope, timestamps. Never persist result rows/columns, execution ID, active database, max-row choice, plan, mask, DSN, credential, or browser state.
- Save accepts only a parser-approved **bare SELECT**. It rejects SHOW, DESCRIBE/DESC, typed EXPLAIN, DML/DDL, multi-statements, unsafe functions, locks and malformed SQL. Reuse QueryGuard parsing/AST checks; do not create a string guard.
- Save validation must **not** resolve credentials, inspect target schema, execute SQL, call disclosure preflight, or create query execution history. Disclosure rules are mutable and only the actual Run/Explain path authorizes result release.
- Load updates the current worksheet statement only. It must **not** call execute, explain, schema, history, related-record or disclosure-policy endpoints, and cannot change target, active database, max rows, prior result, history, or disclosure state.
- Running a loaded statement uses untouched existing endpoints and enforcement. A saved statement may later be rejected by target readiness, SQL guard, or disclosure policy; show existing controlled errors, never pre-authorize in the browser.
- `name`: trim; required; maximum 120 Unicode code points; reject control characters. It is display text, not an SQL identifier.
- `statement`: trim; required; maximum 16 KiB UTF-8. Store authored trimmed text, not executable SQL with a server-injected LIMIT.
- Server-side search is case-insensitive substring matching on **name only**. Never search statement body.

### Protected text and audit

- SQL text can contain user-authored literals. It is protected content: only the visibility matrix may receive the `statement` field. Never copy it to audit result text, errors, logs, history, metrics, telemetry, test output, public docs, or unauthorised UI.
- Create/update/delete write fixed audit events: `query.saved_statement.created`, `query.saved_statement.updated`, `query.saved_statement.deleted`. Audit may identify target and opaque saved-statement ID, never statement/name/owner/search text/result/credential/DSN.
- Mutation and audit write must commit atomically in one metadata transaction. If audit persistence fails, no mutation commits and the handler returns a controlled error.
- Listing and loading are reads: neither creates an audit event nor a `query_executions` row.

## API Contract

### Types

```
QuerySavedStatementScope = personal | shared_template
```

Response item:

```json
{
  "id": 42,
  "targetResourceId": 616,
  "name": "Recent orders",
  "statement": "SELECT id, created_at FROM orders",
  "scope": "personal",
  "createdAt": "2026-07-27T08:30:00Z",
  "updatedAt": "2026-07-27T08:31:00Z"
}
```

Routes, all behind a fresh authenticated query actor:

| Method | Path | Behaviour |
| --- | --- | --- |
| GET | `/query-targets/{id}/saved-statements?q=&page=&pageSize=` | Owner's personal statements plus target shared templates |
| POST | `/query-targets/{id}/saved-statements` | Create personal; shared only for admin |
| PUT | `/query-targets/{id}/saved-statements/{statementId}` | Update name/body, scope immutable |
| DELETE | `/query-targets/{id}/saved-statements/{statementId}` | Delete authorized record |

GET returns `{items, pageInfo, canManageSharedTemplates}`. The boolean is server-derived and controls only frontend affordance visibility; service authorization remains authoritative.

Create request:
```json
{ "name": "Recent orders", "statement": "SELECT id FROM orders", "scope": "personal" }
```
Update request omits scope:
```json
{ "name": "Recent orders", "statement": "SELECT id FROM orders" }
```

Reject unknown JSON fields; duplicate query keys; invalid target/ID/page/pageSize; unknown scope; oversized or malformed fields; and any client-supplied identity/role/audit/credential/result/policy field with controlled 400. Return 401 absent/stale bearer, 403 unauthorized mutation, 404 unknown target or non-visible statement, and fixed 5xx for persistence/audit failure.

### Migration

Create `migrations/00013_query_saved_statements.sql`:

```
query_saved_statements
  id                  BIGINT UNSIGNED PK AUTO_INCREMENT
  target_resource_id  BIGINT UNSIGNED NOT NULL
  owner_user_id       BIGINT UNSIGNED NOT NULL
  name                VARCHAR(120) NOT NULL
  statement           TEXT NOT NULL
  scope               VARCHAR(32) NOT NULL CHECK personal/shared_template
  created_at          DATETIME(6) NOT NULL
  updated_at          DATETIME(6) NOT NULL
```

Add bounded indexes for `(target_resource_id, scope, updated_at)` and `(target_resource_id, owner_user_id, updated_at)`. No foreign keys, full-text index, statement-text index or global uniqueness constraint.

## Authorization Matrix

| Operation | Personal | Shared Template |
| --- | --- | --- |
| List | Owner only | Any authenticated actor for same target |
| Load | Owner only | Any authenticated actor for same target |
| Create | Any authenticated owner | Admin only |
| Update | Owner only | Admin only |
| Delete | Owner only | Admin only |

**Critical invariant**: Admin cannot read another user's personal statement. Admin privilege applies only to shared_template scope.

## Responsive Desktop/Mobile Behavior

- **Desktop**: Create and edit use a modal `Dialog` component with form fields (name, statement, scope display). Delete uses an `AlertDialog` confirmation. Focus returns to the trigger button after close.
- **Mobile (375px)**: Create and edit use a bottom `Sheet` component. Delete uses `AlertDialog`. Same focus restoration.
- Both viewports: Library panel renders within the workbench's saved-statements tab. No standalone route or page.

## EN/zh-CN Requirements

All user-facing strings must be available in both `en` and `zh-CN` message files. This includes:
- Tab label: "Saved sheets" / "已保存脚本"
- All button labels, aria-labels, dialog titles, descriptions
- Empty, loading, and error states
- Scope labels: "Personal" / "个人", "Shared template" / "共享模板"
- Scope immutability hint: "(cannot be changed)" / "(无法更改)"

## Audit/No-Leak Rules

1. Statement text is authorized user content. Only the visibility matrix (owner of personal, any actor for shared_template) may receive it in API responses.
2. Never copy statement text to audit payloads, error messages, logs, metrics, telemetry, test output, public docs, or unauthorized DOM.
3. Audit events identify target and opaque saved-statement ID only. Never include statement, name, owner, search text, result, credential, or DSN.
4. Mutations and audit writes are atomic. Audit failure = no mutation commits.
5. List and load are read-only: no audit events, no `query_executions` rows.

## Non-Goals

- Export/download/copy-all/bulk clipboard, public links, sharing outside target scope, collaboration, folders/tags/favorites, version history, schedules/background jobs, notebook/comments, AI/MCP/visual builder.
- Named or positional parameters, interpolation, secret placeholders or execution on load.
- New query engine, relaxed guard, browser SQL parser, direct target-DB connection from CRUD/list routes, credential changes, disclosure-policy changes, result persistence or history schema change.
- Broad admin read access to personal statements, public owner IDs, or edits to root user WIP.

## Acceptance Matrix

| # | Criterion | Evidence Required |
| --- | --- | --- |
| 1 | Tracked spec/design contain all locked decisions without placeholders | File existence and content audit |
| 2 | Backend enforces target/owner/scope authorization and atomic fixed audit events | Service + repository unit tests |
| 3 | Save/load never executes or creates query history/audit rows | Explicit test proof |
| 4 | Loaded Run follows existing access, guard, disclosure, executor and execution-audit chain | E2E Run-after-load test |
| 5 | No response/error/audit leaks statement text outside authorized loading | Code audit + test proof |
| 6 | Backend/frontend gates and all real E2E runs pass with zero failures/skips | CI output + 3x E2E totals |
| 7 | Momus OKAY and independent Oracle no P1/P2 apply to exact candidates | Review artifacts |
| 8 | Fast-forward merge/push, CI and evidence are independently verified | CI URLs + verifier artifact |
