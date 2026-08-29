# components/resources

Resource interaction components.

Admin-only mutation affordances (`CreateResourceSheet`, resource edit,
archive/restore, and the table-level create button) are presentation hints;
the backend remains the authorization boundary for every write.

Resource edit submits explicit empty typed-profile values through the profile
PATCH contract so operators can clear stale string fields. Numeric fields are
cleared through the confirmed typed-profile removal action, which warns before
discarding unrelated unsaved form edits.

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
