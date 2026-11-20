# components/query

React client components for the query workbench feature.

## Files

| File | Purpose |
|------|---------|
| clickhouse-worksheet-objects.tsx | Renders the same target/generation-scoped catalog as the ClickHouse editor; includes only worksheet-approved tables and their disclosed column names. |
| clickhouse-preview.tsx | Bounded, cancellable table preview for targets advertising `clickHousePreview`; table, columns, eligible UTC daily-count axes and catalog generation come from the BFF. |
| query-workbench.tsx | Scoped or all-environment search, exact persisted-target recovery/cache, fallback/retry, engine discovery, navigation, unavailable-target locking, responsive wrapping context bar (context group vs shrink-0 actions on a separate mobile line so no trigger leaves the viewport), and editor shell |
| query-editor-shell.tsx | Shared result-page navigation includes ClickHouse for targets advertising `clickHousePaging`. Tabbed editor shell adapter over WorksheetSession: paints run/template/paging, OCC workspace persist (aborted on unmount), per-cell truncated badges and page notice, CSV export gated on the same whole-page eligibility predicate the serializer enforces, copy blocked on truncated cells, cancellation outcome region with explicit refresh for non-terminal reads, controlled 409 delivery-refusal copy, unavailable-target retargeting, server-authorized history restore, explicit-target-pin hydrate (an `explicitActiveTarget` deep link activates the pin-matching persisted worksheet and opens a fresh one when none binds it — the restore order can no longer silently retarget a deep link), depth-indented explain plan nodes resolved from parentId, an explain cards/text view switch where PostgreSQL nodes render their native `label` + `cost=a..b` and `container` nodes keep the tree shape (MySQL nodes without `label` fall back to the localized operation name), localized generated worksheet/preview names and tab action labels, a valid tab/tablist/tabpanel structure (shared `worksheet-content` panel, tablist owns only `role=tab` buttons with a decorative `data-close-worksheet` × marker handled by the tab's own click, real Close/Rename controls and the rename input in the adjacent toolbar, Delete closes the focused tab and F2/double-click starts rename, surviving active tab is refocused after close), and -700 light-theme status/status-text tones for contrast |
| query-saved-statements.tsx | Saved statement terminal list generations with CRUD, shared-template affordance gate, and a terminal delete state machine (pending blocks dismissal/duplicate submit; retryable codes retry; forbidden is non-retryable; not_found / saved_statement_not_found refreshes and announces absence; last-row-on-later-page falls back to the previous page); PostgreSQL callers scope list+create by the worksheet's connection (`database`) and optional `schema` pin |
| query-workbench-navigator.tsx | Target navigator wrapper |
| query-connection-navigator.tsx | Connection target selector dialog/sheet with localized loaded/total paging |
| query-connection-navigator-body.tsx | Navigator body with search and target groups |
| query-connection-navigator-list.tsx | Target list rendering |
| query-governance-panel.tsx | Governance and access detail panel, including disclosure-policy export status; the compact row keeps blockers and the admin credential link while the managed-by-admin helper lives in the Details dialog |
| query-history-panel.tsx | Query execution history panel whose statement restore affordance follows only server-computed eligibility; rows/detail render localized copy from controlled error codes (raw `errorMessage` never shown, code kept as diagnostic), translate the `[statement withheld]` privacy sentinel, and the status filter supplies localized items so Base UI never shows raw values |
| query-object-explorer.tsx | Schema object explorer with tree and inspector; reads schema catalog, including database search, system visibility, and metadata refresh; expanded objects list their columns (type, PK/FK badges), with inline inspect/preview actions in the expanded detail, and the row context menu offers the same actions, loading detail first when not yet fetched |
| query-object-inspector.tsx | Object metadata inspector (columns, indexes, FKs, definition) with localized controlled definition errors and transient-only retry |
| query-object-quick-navigator.tsx | Cmd+P quick object search |
| query-object-tree.tsx | Schema tree rendering (database→object; optional PostgreSQL connection→schema→object); object rows accept an optional right-click context menu via `renderObjectMenu` |
| query-relationship-map.tsx | FK relationship map dialog with localized controlled errors and transient-only retry |
| query-schema-browser.tsx | Mobile schema browser sheet |
| sql-code-editor.tsx | Lazy-loaded CodeMirror SQL editor |
| sql-code-editor-client.tsx | Client-side CodeMirror SQL editor with engine-specific completions (ClickHouse resolves bare columns against its single approved FROM table); declares `.cm-content` keyboard entry explicitly (`tabindex` 0, or -1 while disabled) |
