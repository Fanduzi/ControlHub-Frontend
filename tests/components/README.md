# tests/components

Vitest component tests for React UI components.

## Interfaces

- Tests exercise components through rendered accessible controls and public callbacks.

## Dependencies

- Upstream: production components, localized messages, and mocked system boundaries
- Downstream: none

## Tests

| Test | Component under test |
|------|---------------------|
| query-saved-statements.test.tsx | QuerySavedStatements — terminal list generations, terminal delete state machine, CRUD, shared-template gate, templates |
| query-workbench.test.tsx | QueryWorkbench — full workbench integration with synchronized asynchronous select interactions |
| query-editor-shell.test.tsx | QueryEditorShell — tabbed editor shell, template mode, lifecycle disposal, execution routing |
| query-connection-navigator.test.tsx | Connection navigator |
| query-credential-settings.test.tsx | Query credential settings |
| query-disclosure-settings.test.tsx | Query disclosure settings |
| query-object-explorer.test.tsx | Schema object explorer |
| query-object-inspector.test.tsx | Object inspector |
| query-object-quick-navigator.test.tsx | Quick object navigator |
| command-palette.test.tsx | Command palette navigation, resource search, and admin gating |
| query-object-tree.test.tsx | Object tree |
| query-relationship-map.test.tsx | Relationship map |
| create-resource-sheet.test.tsx | Create resource sheet, governed-identity normalization and conflicts, and all typed-profile identity fields |
| edit-resource-sheet.test.tsx | Edit resource sheet, immutable origin, governed-identity conflicts, manual health override set/clear, all typed-profile fields/errors, PATCH clears, numeric rejection, and confirmed profile removal |
| resource-table.test.tsx | Resource table, including settings-backed lifecycle and health taxonomies, completeness and health evidence fields, reviewed admin bulk-label request shapes, and localized error feedback |
| resource-table-ingestion.test.tsx | Resource-table editor gate for the inventory import control |
| ingestion-dialog.test.tsx | Admin ingestion preview/confirm, localized summary, server conflict, malformed upload, and fresh-409 review handling |
| resource-detail-sheet.test.tsx | Resource detail sheet identity, localized completeness and health/override evidence, empty states, effective-value provenance, and admin override conflicts |
| named-inventory-view-controls.test.tsx | Personal/shared saved inventory-view save, apply, rename, and delete controls |
| resource-detail-sheet-loader.test.tsx | Resource detail sheet loader |
| resource-link.test.tsx | Resource link |
| resource-relation-panel.test.tsx | Resource relation panel rule discovery, target constraints, controlled rejection, role gates, and mutations |
| resource-archive-button.test.tsx | Resource archive button (admin-only affordance; non-admin sees nothing) |
| database-table.test.tsx | Database table, including Database Proxy rows in Database Estate |
| database-instance-facts-panel.test.tsx | Database instance facts |
| database-consistency-panel.test.tsx | Database consistency |
| database-decision-deck.test.tsx | Database decision deck |
| database-supporting-details.test.tsx | Database supporting details |
| database-operator-workbench.test.tsx | Database operator workbench |
| cluster-members-table.test.tsx | Cluster members table |
| overview-content.test.tsx | Overview content |
| activity-timeline.test.tsx | Activity timeline |
| audit-table.test.tsx | Audit table, including URL-owned server search, complete inventory filters, localized operations, and server-owned before/after evidence |
| sidebar.test.tsx | App sidebar |
| topbar.test.tsx | App topbar (incl. fail-closed sign-out: success clears+leaves, network/non-2xx failure stays with controlled error) |
| theme-toggle.test.tsx | Theme toggle |
| accent-switcher.test.tsx | Accent color switcher |
| language-switcher.test.tsx | Language switcher |
| multi-select-filter.test.tsx | Multi-select filter |
| pagination-controls.test.tsx | Pagination controls |
| db-type-icon.test.tsx | Database type icon |
| select.test.tsx | Select component |
| environment-provider.test.tsx | Environment provider |

`environment-provider.test.tsx` verifies the environment probe starts from
BFF presentation role state rather than browser bearer storage and refreshes
Server Components after an environment selection.
