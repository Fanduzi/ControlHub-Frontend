# Machine principals

The `/settings/machine-principals` route is an administrator-only browser UI
for the machine-principal endpoints introduced by backend `dbe6203`.

- Create and rotate requests send only the principal name, closed canonical
  scopes, and an expiry between 1 and 90 days (30 days by default).
- The backend plaintext secret is kept only in transient component state. It
  is shown once after create or rotate, with a copy warning, and cleared when
  dismissed; it is never stored or fetched again by the UI.
- Non-admin sessions render the restricted state and do not call the service.
- The current backend list response contains principals but no credential
  metadata. Existing rows therefore show disabled rotate/revoke actions until
  a credential is present in the response or was issued in the current view.

The route is intentionally direct in this slice; settings navigation and
additional visual polish are follow-up work.
