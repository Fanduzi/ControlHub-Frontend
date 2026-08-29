# Audit components

Operator-facing audit evidence components.

`audit-table.tsx` renders the existing paginated audit feed, including the
server-owned `changes` list. Each change shows its domain field, add/update/remove
operation, and before/after values. Events without field changes keep the legacy
summary row and render an em dash in the change column.

The filter keeps every backend-emitted inventory resource/profile/relationship
event available even when it is absent from the current page. Change operations
use the localized closed add/update/remove vocabulary.
