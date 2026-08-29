# components/providers

Root and console client providers.

- `app-providers.tsx`: intl/theme/accent/tooltip (no environments).
- `environment-provider.tsx`: loads environments once through the authenticated
  BFF path; authentication is enforced server-side and the Backend Bearer
  Credential remains in the HttpOnly Operator Session cookie. It persists the
  chosen environment; the selector's single route replacement refreshes Server
  Components.
