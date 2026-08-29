# Machine principals

The `/settings/machine-principals` route is an administrator-only browser UI
for the machine-principal endpoints introduced by backend `dbe6203` and
lifecycle-list metadata from `25c7cc9`.

- Create requests use selected canonical scopes and an expiry between 1 and 90
  days (30 days by default). Rotation starts with an empty, explicit
  replacement-scope picker; it never reuses or guesses prior scopes.
- The backend plaintext secret is kept only in transient component state. It
  is shown once after create or rotate, with a copy warning, and cleared when
  dismissed; it is never stored or fetched again by the UI.
- Non-admin sessions render the restricted state and do not call the service.
- Reloaded rows show safe credential lifecycle IDs and timestamps, never a
  secret, lookup identifier, hash, or scopes. Each non-revoked record can be
  rotated or revoked; rotation keeps the prior record active until revocation
  or expiry. Expired records are labelled and have disabled controls.

The route is linked from Settings and the administrator sidebar.
