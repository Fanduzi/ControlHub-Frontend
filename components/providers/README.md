# components/providers

Root and console client providers.

- `app-providers.tsx`: intl/theme/accent/tooltip (no environments).
- `environment-provider.tsx`: loads environments only when a legacy browser credential exists; BFF-only sealed sessions wait for #15.

