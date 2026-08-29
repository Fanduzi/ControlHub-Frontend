# Frontend transport types

TypeScript contracts for backend JSON responses and frontend requests.

`resource.ts` includes effective health status, `fresh`/`stale`/`never`
freshness, observed time, observer, and nullable manual override transport
fields. A nullable update `healthStatus` clears the manual override.
The new read fields are optional in the browser type only so a rolling frontend
deployment fails closed against an older backend payload.

`audit.ts` defines the append-only audit event contract. Inventory events may
include server-owned field changes with a domain field name, operation, and
optional before/after values; legacy and non-inventory events omit `changes`.

`resource.ts` defines immutable resource origin plus managed aliases and global
external system/value identifiers for create, update, and response contracts.
