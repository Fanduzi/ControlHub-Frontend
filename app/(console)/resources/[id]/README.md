# app/(console)/resources/[id]

Authenticated resource detail route. `page.tsx` renders a known resource and
calls `notFound()` for malformed, unsafe, missing, or unavailable IDs.

`not-found.tsx` provides the localized missing-or-archived resource message
and links back to `/resources`.
