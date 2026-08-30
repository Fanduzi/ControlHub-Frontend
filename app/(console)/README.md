# app/(console)

Authenticated console route group.

`layout.tsx` wraps pages in `EnvironmentProvider` + `AppShell` so the public login route never probes `/environments`.

The retained `/cmdb` route renders a migration notice with a link to `/resources`.

The resource detail segment has a localized `not-found.tsx` boundary for
missing or archived resources; it links back to `/resources` while the root
`app/not-found.tsx` boundary handles unmatched routes outside the segment.

Resources and databases pages fail closed to an empty result when their
environment slug is unknown; they do not issue an unscoped inventory request.
Audits use the same canonical `environment` slug and fail closed to an empty
table, resolving known slugs to the backend's numeric `environmentId` filter.
Database URL search and pagination are server-owned, so deep links and
navigation request the current scoped result rather than filtering a capped
client-side slice.
The overview reads the selected environment preference from its cookie during
server rendering, then loads the scoped complete list once and derives its
attention data before client metrics render.

Query Workbench and query disclosure policies use the same URL environment
scope, including their target lookups and searches.
An explicit invalid or unavailable Query Workbench `targetId` fails closed to
the unavailable-target state while retaining the navigator; omitting it keeps
the default target selection.

Topology resolves an explicit `environment` slug to the numeric backend scope;
unknown or invalid explicit values stay empty rather than using a persisted
scope. When the parameter is absent, the workspace retains the current
EnvironmentProvider environment. Root and topology controls remain client URL
state, so omitting or rejecting a root loads the scoped candidate graph.

`settings/README.md` documents the Settings overview and direct administrator
routes.
