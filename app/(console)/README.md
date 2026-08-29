# app/(console)

Authenticated console route group.

`layout.tsx` wraps pages in `EnvironmentProvider` + `AppShell` so the public login route never probes `/environments`.

The retained `/cmdb` route renders a migration notice with a link to `/resources`.

The resource detail segment has a localized `not-found.tsx` boundary for
missing or archived resources; it links back to `/resources` while the root
`app/not-found.tsx` boundary handles unmatched routes outside the segment.
