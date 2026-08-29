# app

Next.js App Router entrypoints for the public login, authenticated console,
API routes, and root error boundaries.

The root `not-found.tsx` renders the localized generic 404 boundary. Nested
route groups own more specific boundaries, including the resource detail
boundary documented in `app/(console)/README.md`.
