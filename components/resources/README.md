# components/resources

Resource interaction components.

`health-evidence.tsx` renders localized effective-health freshness, observed
time, observer, and manual override consistently in list and detail surfaces.

`named-inventory-view-controls.tsx` saves personal or administrator-shared
resource-filter URLs, applies personal or shared saved views without caching
their results, and manages selected views when authorized.

Admin-only mutation affordances (`CreateResourceSheet`, resource edit,
archive/restore, and the table-level create button) are presentation hints;
the backend remains the authorization boundary for every write.

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

## Files

| File | Responsibility |
|------|---------------|
| `resource-table.tsx` | Renders the inventory table, saved views, and filters, including lifecycle and health options supplied by settings. |

## Interfaces

- `ResourceTable` receives lifecycle and health dictionaries from the resources server page, preserves the existing URL filter contract, hosts saved view controls, and displays effective health with freshness and observation evidence.

## Dependencies

- Upstream: `app/(console)/resources/page.tsx`, `services/settings`
- Downstream: shared table, filter, pagination, and resource-detail components

Resource detail sheets show effective values with provenance and let admins set
or clear only the backend-supported display name, lifecycle status, and health
status overrides with expected-version conflict handling.
