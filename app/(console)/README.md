# app/(console)

Authenticated console route group.

`layout.tsx` wraps pages in `EnvironmentProvider` + `AppShell` so the public login route never probes `/environments`.

The retained `/cmdb` route renders a migration notice with a link to `/resources`.
