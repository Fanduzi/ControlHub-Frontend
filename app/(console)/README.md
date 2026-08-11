# app/(console)

Authenticated console route group.

`layout.tsx` wraps pages in `EnvironmentProvider` + `AppShell` so the public login route never probes `/environments`.
