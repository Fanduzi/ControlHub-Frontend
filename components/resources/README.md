# components/resources

Resource interaction components.

Admin-only mutation affordances (`CreateResourceSheet`, resource edit,
archive/restore, and the table-level create button) are presentation hints;
the backend remains the authorization boundary for every write.

Resource edit submits explicit empty typed-profile values through the profile
PATCH contract so operators can clear stale fields.
