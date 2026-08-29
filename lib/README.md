# lib

Shared frontend libraries.

## Files

| File | Responsibility |
|------|----------------|
| `list-page-search-params.ts` | Normalizes paginated resource/audit URL state and safely parses positive decimal IDs |
| `environment-params.ts` | Resolves environment slugs to IDs |
| `view-models.ts` | Maps backend transport records to console view models |

`auth-role.ts` recovers the presentation-only admin gate from `controlhub.role`
storage/cookies. It does not read or decode Backend Bearer Credentials.
Operator Session BFF primitives live in `lib/operator-session/`.

`navigation.ts` marks the audits entry `adminOnly`; sidebar and command
palette hide it for non-admin operators, mirroring the server-owned access
matrix.

`environment-params.ts` resolves environment slugs for inventory list pages;
unknown slugs fail closed so those pages render an empty scoped result.

`list-page-search-params.ts` normalizes page, filter, and audit search values
from shareable list URLs. `parsePositiveDecimalInteger` is the shared strict
parser for URL IDs.

`controlled-error-codes.ts` is the closed console union of Controlled Error
Codes. It must match OpenAPI `ErrorResponse.error` and is not generated.
`scripts/check-controlled-error-codes.mjs` fails when the two sets drift.
This includes `bulk_resource_mutation_conflict` for reviewed bulk-label writes
and ingestion conflict/stale-preview outcomes, so the console handles the
backend contract without deriving errors from HTTP status.
`profile-field-registry.ts` catalogs typed-profile fields for host, database
instance, database cluster, and service, plus domain_name (required FQDN) and
virtual_ip (required single IP address). Required flags match backend minimum
manual identity; `mapControlledFieldPath` places backend field errors on the
matching profile inputs. Labels stay free classification. Domain Name does
not collect a resolution target as profile text.

`profile-field-registry.ts` is the console typed-profile contract. Database Proxy
fields are technologySubtype, host, port, role (active or standby), and optional
version. Control Plane Component fields are componentSubtype, endpoint, optional
version, and role (active or standby). Ambiguous `ha` is not a component subtype;
use `ha_monitor`.

`view-models.ts` Database Estate listing includes `database_instance`,
`database_cluster`, and `database_proxy`.

Overview view models use the paginating resource helper and derive attention
from the same scoped complete list, retaining an optional environment filter.

Resource name, alias, and external-identifier conflicts each have a distinct code.

## Interfaces

- `parseResourceListSearchParams` preserves the structured Inventory search contract while dropping pagination snapshots from saved views.
- `parseAuditListSearchParams` normalizes audit pagination and repeated filters.
- `parsePositiveDecimalInteger` accepts only safe positive decimal URL IDs.

## Dependencies

- Upstream: Next.js route search params and transport types
- Downstream: app routes and services
