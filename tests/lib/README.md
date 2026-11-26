# tests/lib

Vitest unit tests for frontend library modules.

## Interfaces

ClickHouse completion tests cover table and unqualified column positions, quoted source tables, statement isolation, and ambiguous sources. Catalog hook tests cover target changes, approval generations, late and denied responses, and exclusion of preview-only tables.

Worksheet session tests cover approval-generation pinning across ClickHouse page turns and compatibility with older single-result servers.

The SQL run-scope tests cover dialect-specific statement boundaries and selection/cursor behavior. Worksheet session coverage pins paging to the last delivered statement, including after an edit or a cancelled replacement Run.

- Tests exercise exported library functions with literal input/output contracts.
- `worksheet-session`/`schema-catalog` tests cover the PostgreSQL composite context: connection/schema pinning, keyed execution, abort-then-reconcile cancellation, and the terminal+claim history union.
- `worksheet-session` navigation coverage includes single in-flight intent dedup, supersession aborting the old attempt, context-teardown abort, `execution_already_exists` replay via keyed state read, `client_execution_id_conflict` hard stop, late-response dropping, and cancellation probes sharing one total budget (abortable backoff, hanging GET consumed by the deadline → `unknown` — never stale `running`, while a deadline-interrupted wait keeps the last completed read, newer-probe ownership replacement, no stuck `requested` state).

## Dependencies

- Upstream: production `lib/` modules and Vitest
- Downstream: none

`environment-params.test.ts` covers known-slug resolution for inventory and
audit list pages, the explicit All sentinel, and fail-closed unknown slugs.

`format.test.ts` covers safe caller-locale relative timestamp labels and the
24-hour/future date-time fallback.

`messages-workspace-history-parity.test.ts` keeps the workspace conflict and
history statement-recovery copy present in both English and zh-CN.

`schema-catalog.test.ts` covers schema catalog through its interface (库身份
isolation, page-size isolation, stale abort, detail TTL, concurrency, stable
completion namespace identity).

`worksheet-session.test.ts` covers 工作表 commands: template enter/exit, typed
SQL edits, execute vs template routing, stale request rejection, template field
errors.

`operator-session-facade.test.ts` covers login/logout/readIdentity/authenticateCookie/gatePage,
including the rate-limited login path returning a controlled 429
`login_rate_limited` with `Retry-After: 60` and no session cookie.

`query-result-envelope.test.ts` covers governed result disclosure checks.

`query-result-cell-json.test.ts` covers the bounded result-cell JSON
pretty-printer: exact indentation output, verbatim number lexemes, duplicate
keys, order and escapes, and null for malformed, scalar, over-depth, and
over-length input.

`query-result-export.test.ts` covers the shared whole-page export gate and the
JSON serializer: verbatim `{columns, rows}` output preserving duplicate column
names and delivered scalar/text values exactly (no formula guard in JSON), and
table-driven refusals shared by JSON and CSV for masked/blocked/disallowed
columns, truncated cells, missing/sparse matrices, row-width mismatches, empty
column names, and non-finite numbers.

`query-result-page-view.test.ts` covers the display-only page view: exact
decimal sorting for BIGINT UNSIGNED and ClickHouse UInt32/UInt64 wire strings,
DECIMAL wire strings with negatives and sub-float tails, PostgreSQL NUMERIC
special values ordered alongside finite decimals, code-unit ordering for
VARCHAR numerals, NULL and truncated cells sinking last in both directions
with delivered tie order, case-insensitive literal filtering that never
matches truncated/NULL/missing-flag cells, flags traveling with their row,
masked and copy-denied columns making sort and filter no-ops, legacy columns
without a string `databaseType` falling back to text ordering, and delivered
arrays staying unmutated.

`query-result-range.test.ts` covers Markdown escaped literal cells, numbered structural headers, and refusal for hidden or restricted cells. It also covers the rectangular selection helper: reversed
corners normalize, TSV serializes row-major without headers, SQL NULL and
empty text both emit empty fields, negative numbers stay verbatim,
tab/newline/quote fields are quoted, formula-like strings get the apostrophe
guard, and refusals fire for protected or inconsistently permitted columns,
truncated cells, missing matrix flags, non-scalar values, and out-of-bounds
rectangles — while restricted cells outside the rectangle never block it.

Operator Session BFF tests (Phase 38X-1C):

| File | Coverage |
|------|----------|
| `operator-session-config.test.ts` | Fail-closed configuration validation (base64-only keys, low-diversity key rejection, HTTPS-only production Origin, secure-cookie policy) |
| `operator-session-seal.test.ts` | Sealed cookie identity round-trip, eight-hour expiry, key rotation window (15 minutes), tamper rejection |
| `operator-session-origin.test.ts` | Console Origin guard on unsafe methods |
| `operator-session-backend.test.ts` | Server-side backend login and generic outcome mapping, incl. HTTP 429 → `rate-limited` without credential leakage |
| `operator-session-response.test.ts` | BFF `bffJson` synthesized bodies include a snake_case Controlled Error Code on `error` |
| `auth-role.test.ts` | Presentation-only admin gate from the trusted BFF session; browser role tampering fails closed |
| `profile-field-registry.test.ts` | Core CI typed-profile identity flags and backend field-path mapping |
| `view-models.test.ts` | Resource, Database Estate, and audit view-model composition, including actor labels, targetless placeholders, unambiguous parents, scoped search, and empty cluster members |
| `database-read-model-consistency.test.ts` | Database member, parent, profile, and topology consistency outcomes |
| `list-page-search-params.test.ts` | Resource/audit URL parsing, including bounded key/key:value labels plus safe pagination/search normalization and repeated environment/owner filters |
