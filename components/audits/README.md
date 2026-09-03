# Audit components

Operator-facing audit evidence components.

`audit-table.tsx` renders the existing paginated audit feed, including the
server-owned `q` search URL, and `changes` list. Search navigation uses the
shared 300ms debounce, sends only the settled draft to the server, and remains
intact across pagination and filters. Browser navigation reconciles the input
from `q`, while a local draft waits for its exact URL acknowledgment and ignores
older responses. Popstate invalidates pending search generations so browser
Back/Forward cannot be undone by an old timer. Each change shows its domain
field, add/update/remove operation, and before/after values. Events without
field changes keep the legacy summary row and render an em dash in the change
column.

The filter seeds every backend-emitted event type (inventory, auth, query
schema/execute/explain/credential, related-record navigation, and machine
principal/credential) and result (`success|succeeded|warning|error|failure|failed|rejected|denied|unsupported`)
so empty or narrow pages can still filter login, credential, and machine
events. Labels come from `activityTimeline.eventTypes` / `results`;
`formatLabel` is only the unknown-type fallback. Change operations use the
localized closed add/update/remove vocabulary.
