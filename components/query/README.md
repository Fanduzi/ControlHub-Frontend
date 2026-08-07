# components/query

React client components for the query workbench feature.

## Files

| File | Purpose |
|------|---------|
| query-workbench.tsx | Top-level workbench layout with navigator and editor shell |
| query-editor-shell.tsx | Tabbed editor shell (worksheet, history, saved statements; template mode via load and SQL-edit exit) |
| query-saved-statements.tsx | Saved statement list with CRUD and shared-template affordance gate |
| query-workbench-navigator.tsx | Target navigator wrapper |
| query-connection-navigator.tsx | Connection target selector dialog/sheet |
| query-connection-navigator-body.tsx | Navigator body with search and target groups |
| query-connection-navigator-list.tsx | Target list rendering |
| query-governance-panel.tsx | Governance and access detail panel |
| query-history-panel.tsx | Query execution history panel |
| query-object-explorer.tsx | Schema object explorer with tree and inspector |
| query-object-inspector.tsx | Object metadata inspector (columns, indexes, FKs, definition) |
| query-object-quick-navigator.tsx | Cmd+P quick object search |
| query-object-tree.tsx | Schema tree rendering |
| query-relationship-map.tsx | FK relationship map dialog |
| query-schema-browser.tsx | Mobile schema browser sheet |
| sql-code-editor.tsx | Lazy-loaded CodeMirror SQL editor |
| sql-code-editor-client.tsx | Client-side CodeMirror SQL editor with completions |
