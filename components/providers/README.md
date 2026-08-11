# components/providers

Root and console client providers.

- `app-providers.tsx`: intl/theme/accent/tooltip (no environments).
- `environment-provider.tsx`: loads environments when the BFF login has stored
  presentation role state; the Backend Bearer Credential remains server-held in
  the HttpOnly Operator Session cookie.
