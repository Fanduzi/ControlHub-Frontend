# Frontend transport types

TypeScript contracts for backend JSON responses and frontend requests.

`audit.ts` defines the append-only audit event contract. Inventory events may
include server-owned field changes with a domain field name, operation, and
optional before/after values; legacy and non-inventory events omit `changes`.
