# Audit components

Operator-facing audit evidence components.

`audit-table.tsx` renders the existing paginated audit feed, including the
server-owned `q` search URL, and `changes` list. Search is sent to the server
and remains intact across pagination and filters. Each change shows its domain
field, add/update/remove operation, and before/after values. Events without
field changes keep the legacy summary row and render an em dash in the change
column.

The filter keeps every backend-emitted inventory resource/profile/relationship
event plus the stable `query.executed` and `related_record_navigation` presets
available even when they are absent from the current page. Change operations
use the localized closed add/update/remove vocabulary.
