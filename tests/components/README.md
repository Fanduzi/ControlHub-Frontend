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
| query-workbench.test.tsx | QueryWorkbench — unavailable-target recovery, scoped search/fallback/retry, engine filtering, server-authorized history fixtures, and formula-safe CSV export |
| query-editor-shell.test.tsx | QueryEditorShell — tabs, template mode, lifecycle, serialized workspace OCC/hydration, scoped persisted-target recovery, unavailable-target locking, navigator-safe worksheet limits, execution routing, server-authorized history restore, and blocked-result redaction |
| query-connection-navigator.test.tsx | Connection navigator |
| query-credential-settings.test.tsx | Query credential settings |
| query-disclosure-settings.test.tsx | Query disclosure settings |
| query-object-explorer.test.tsx | Schema object explorer |
| query-object-inspector.test.tsx | Object inspector controlled error codes, retry behavior, localization, and raw-message isolation |
| query-object-quick-navigator.test.tsx | Quick object navigator |
| command-palette.test.tsx | Command palette empty-query navigation/admin gating and server-authoritative all-type resource search with Provider context, keyboard selection, and stale/error recovery |
| query-object-tree.test.tsx | Object tree |
| query-relationship-map.test.tsx | Relationship map controlled error codes, retry behavior, localization, and raw-message isolation |
| create-resource-sheet.test.tsx | Create resource sheet, governed-identity normalization and conflicts, and all typed-profile identity fields |
| edit-resource-sheet.test.tsx | Edit resource sheet, immutable origin, governed-identity conflicts, manual health override set/clear, all typed-profile fields/errors, PATCH clears, numeric rejection, and confirmed profile removal |
| resource-table.test.tsx | Resource table, including settings-backed owner/environment/lifecycle and health taxonomies, repeated server-owned label URL filters with rapid-add retention, completeness and health evidence fields, reviewed atomic bulk request shapes, selection retention, and localized error feedback |
| resource-table-ingestion.test.tsx | Resource-table editor gate for the inventory import control |
| ingestion-dialog.test.tsx | Admin ingestion preview/confirm, localized summary, server conflict, malformed upload, and fresh-409 review handling |
| resource-detail-sheet.test.tsx | Resource detail sheet identity, localized completeness and health/override evidence, empty states, effective-value provenance, and admin override conflicts |
| named-inventory-view-controls.test.tsx | Personal/shared saved inventory-view repeated-filter save/apply round trips, rename, and delete controls |
| resource-detail-sheet-loader.test.tsx | Resource detail sheet loader, same-id archive/restore refetches, real callback forwarding, and deferred race protection |
| resource-link.test.tsx | Resource link |
| resource-relation-panel.test.tsx | Resource relation panel localization, accessible source direction, source-path mutations, deferred/stale/concurrent deletion, rule discovery, target constraints, controlled rejection, and role gates |
| resource-archive-button.test.tsx | Resource archive/restore button, success refresh/callback ordering, failure rollback, and admin gating |
| database-table.test.tsx | Database table, including Database Proxy rows, server-search URL navigation, localized server-empty state, and page-local signal scope |
| database-instance-facts-panel.test.tsx | Database instance facts |
| database-consistency-panel.test.tsx | Database consistency |
| database-decision-deck.test.tsx | Database decision deck |
| database-supporting-details.test.tsx | Database supporting details |
| database-operator-workbench.test.tsx | Database operator workbench |
| cluster-members-table.test.tsx | Cluster members table, including the localized empty state |
| overview-content.test.tsx | Overview content, including exact actionable attention membership and accessible in-page expansion |
| activity-timeline.test.tsx | Activity timeline |
| audit-table.test.tsx | Audit table, including acknowledgment-guarded debounced search, popstate generation invalidation, complete inventory filters, localized operations, and server-owned before/after evidence |
| sidebar.test.tsx | App sidebar, including canonical environment-scoped Topology navigation |
| machine-principal-settings.test.tsx | Machine-principal lifecycle list, explicit rotation scopes, expiry, mutation guards, copy feedback, and localization |
| machine-principal-entry.test.tsx | Admin-only Settings route discoverability |
| topbar.test.tsx | App topbar, including scoped Query/audit/disclosure/Topology selection and fail-closed sign-out |
| topbar-operator-identity.test.tsx | Topbar identity/role rendering and stale-identity clearing from the BFF session response |
| theme-toggle.test.tsx | Theme toggle |
| accent-switcher.test.tsx | Accent color switcher |
| language-switcher.test.tsx | Language switcher |
| multi-select-filter.test.tsx | Multi-select filter |
| pagination-controls.test.tsx | Pagination controls |
| db-type-icon.test.tsx | Database type icon |
| select.test.tsx | Select component |
| environment-provider.test.tsx | Environment provider |

`environment-provider.test.tsx` verifies the single authenticated BFF
environments probe does not trust browser role state; persisted selection uses
the Topbar's single route replacement to refresh Server Components.
