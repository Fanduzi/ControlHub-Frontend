# databases

Client presentation for the authenticated Database Estate inventory.

`database-table.tsx` renders the server-paginated database view-model slice.
It sends URL search through Next navigation so the page reloads the scoped
server result, while reusing shared pagination controls and preserving local
operational signal controls. Those signal controls explicitly apply to the
current server page because the list contract has no signal predicate.

Database role labels reuse the shared localized formatter; engine subtypes and other non-role values remain backend text.
