# components/query

React client components for the query workbench feature.

## Files

| File | Purpose |
|------|---------|
| query-workbench.tsx | Scoped search, exact persisted-target recovery/cache, fallback/retry, engine discovery, navigation, unavailable-target locking, and editor shell |
| query-editor-shell.tsx | Tabbed editor shell with server-authorized CSV export, serialized owner workspace hydration/OCC persistence, unavailable-target retargeting, worksheet limits across navigator actions, and server-authorized new-tab history restore |
| query-saved-statements.tsx | Saved statement terminal list generations with CRUD, shared-template affordance gate, and a terminal delete state machine (pending blocks dismissal/duplicate submit; retryable codes retry; forbidden is non-retryable; not_found / saved_statement_not_found refreshes and announces absence; last-row-on-later-page falls back to the previous page) |
| query-workbench-navigator.tsx | Target navigator wrapper |
| query-connection-navigator.tsx | Connection target selector dialog/sheet with localized loaded/total paging |
| query-connection-navigator-body.tsx | Navigator body with search and target groups |
| query-connection-navigator-list.tsx | Target list rendering |
| query-governance-panel.tsx | Governance and access detail panel, including disclosure-policy export status |
| query-history-panel.tsx | Query execution history panel whose statement restore affordance follows only server-computed eligibility |
| query-object-explorer.tsx | Schema object explorer with tree and inspector |
| query-object-inspector.tsx | Object metadata inspector (columns, indexes, FKs, definition) with localized controlled definition errors and transient-only retry |
| query-object-quick-navigator.tsx | Cmd+P quick object search |
| query-object-tree.tsx | Schema tree rendering |
| query-relationship-map.tsx | FK relationship map dialog with localized controlled errors and transient-only retry |
| query-schema-browser.tsx | Mobile schema browser sheet |
| sql-code-editor.tsx | Lazy-loaded CodeMirror SQL editor |
| sql-code-editor-client.tsx | Client-side CodeMirror SQL editor with completions |
