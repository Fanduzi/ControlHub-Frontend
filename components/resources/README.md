# components/resources

Resource interaction components.

`health-evidence.tsx` renders localized effective-health freshness, observed
time, observer, and manual override consistently in list and detail surfaces.

## Files

| File | Responsibility |
|------|----------------|
| `resource-table.tsx` | Inventory filters, column visibility, rows, saved-view integration, and compact completeness/health evidence |
| `resource-completeness-panel.tsx` | Read-only server-derived completeness score and missing-requirement presentation |
| `named-inventory-view-controls.tsx` | Personal/shared view save, apply, rename, delete, and permission presentation |
| `ingestion-dialog.tsx` | Sends one CSV/JSON file for server preview, renders localized counts and returned diffs/conflicts including fresh 409 previews, and confirms only a reviewed fingerprint |
| `resource-archive-button.tsx` | Admin archive/restore control that refreshes Server Components and same-id detail data after successful mutations |

`named-inventory-view-controls.tsx` saves personal or administrator-shared
resource-filter URLs, applies personal or shared saved views without caching
their results, and manages selected views when authorized.

## Interfaces

- `ResourceTable` renders the current server-owned Inventory result page. Its
  label chips accept bounded `key` or `key:value` tokens, restore repeated
  `label` URL parameters, and replace them on page one; the loaded page is never
  filtered client-side.
- `NamedInventoryViewControls` saves URL filters and visible columns, then reapplies them on page 1.
- `IngestionDialog` retains the chosen native `File` and format, renders server previews without client matching or writes, and requires explicit operator confirmation after a returned 409 preview.

## Dependencies

- Upstream: console resource page props and translated messages
- Downstream: `services/named-inventory-views`, TanStack Table, Next navigation

Admin-only mutation affordances (`CreateResourceSheet`, `IngestionDialog`, resource edit,
archive/restore, and the table-level create/import/bulk buttons) are presentation hints;
the backend remains the authorization boundary for every write.

The table's admin-only bulk label control sends explicit add, update, or remove
operations for selected rows to the server preview, renders its returned diffs,
maps controlled errors to localized feedback, and confirms only the returned
review fingerprint.

Resource edit submits explicit empty typed-profile values through the profile
PATCH contract so operators can clear stale string fields. Numeric fields are
cleared through the confirmed typed-profile removal action, which warns before
discarding unrelated unsaved form edits.
Manual health overrides use the same resource PATCH flow for set and clear.

Profile mutation failures use the same localized error mapping for save and
clear flows.

Create and edit sheets collect typed profile identity for host, database
instance, database cluster, and service, display the same backend field
errors, and keep labels as free classification. Service worker subtype comes
from the backend dictionary. Create and edit sheets also render Domain Name
FQDN and Virtual IP address fields from `lib/profile-field-registry.ts`.

Create and edit sheets render Database Proxy (technologySubtype, host, port,
active/standby role, optional version) and Control Plane Component
(componentSubtype, endpoint, optional version, active/standby role) from
`lib/profile-field-registry.ts`. Ambiguous `ha` is not offered.

Create/edit sheets manage immutable origin, normalized aliases, and external
system/value identifiers through the shared accessible identity editor. Detail
views expose the same identity, and backend uniqueness conflicts remain explicit.

Resource detail sheets show server-derived completeness plus effective values
with provenance, and let admins set or clear only the backend-supported display
name, lifecycle status, and health status overrides with expected-version
conflict handling.
