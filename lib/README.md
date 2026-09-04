# lib

Shared frontend libraries.

## Files

| File | Responsibility |
|------|----------------|
| `list-page-search-params.ts` | Normalizes paginated resource/audit URL state and safely parses positive decimal IDs |
| `environment-params.ts` | Resolves environment slugs to IDs and the explicit `all` sentinel to unscoped params |
| `view-models.ts` | Maps backend transport records to console view models; audit actors use the backend privacy-safe projection and targetless events use empty placeholders; database-cluster detail models retain `members: []` |
| `topology-mapper.ts` | Maps topology transport nodes and edges into graph layout data, including named cluster groups |
| `query-result-csv.ts` | Serializes visible query-result pages as RFC-4180 CSV while enforcing server-owned disclosure metadata |

`auth-role.ts` reads the presentation-only admin gate from the trusted,
same-origin Operator Session endpoint. It does not trust browser storage or
readable cookies, and never reads or decodes Backend Bearer Credentials.
Operator Session BFF primitives live in `lib/operator-session/`.

`navigation.ts` marks audits and machine-principal administration entries
`adminOnly`; sidebar and command palette hide them for non-admin operators,
mirroring the server-owned access matrix. `machine-principal-copy.ts` supplies
the localized one-time-secret, expiry, and explicit-rotation copy for that
admin UI.

`environment-params.ts` resolves environment slugs for console list pages;
unknown slugs fail closed so those pages render an empty scoped result, while
the reserved `all` slug explicitly removes environment scope.

`list-page-search-params.ts` normalizes page, filter, and audit search values
from shareable list URLs. Resource labels retain valid unknown `key` or
`key:value` tokens without requiring a current-page taxonomy, while discarding
blank, malformed, and overlong values. `parsePositiveDecimalInteger` is the
shared strict parser for URL IDs.

`query-result-csv.ts` emits the current visible result page only. Raw values
need both `raw_copy_allowed` and `copyAllowed`; masked and malformed disclosure
metadata become stable placeholders, and values/headers beginning with a
spreadsheet formula prefix are emitted as literal text.

`format.ts` provides the caller-locale absolute and native relative timestamp
labels; relative labels use date-time formatting after 24 hours.

`health-observation-guidance.ts` tells inventory and overview when unknown
health is missing collector observation rather than a console setting.

`controlled-error-codes.ts` is the closed console union of Controlled Error
Codes. It must match OpenAPI `ErrorResponse.error` and is not generated.
`scripts/check-controlled-error-codes.mjs` fails when the two sets drift.
`controlled-error-copy.ts` maps a JSON `error` code to `errors.codes.*` copy
and never interpolates the English `message`. Unknown codes use generic copy
plus the code; a missing code is unavailability except 401.
This includes `bulk_resource_mutation_conflict` for reviewed bulk-label writes
and ingestion conflict/stale-preview/collector-state-limit outcomes, so the
console handles the backend contract without deriving errors from HTTP status.
It also includes `query_workspace_conflict` and `query_execution_not_found`
for server-authoritative workspace persistence and owner-only statement recovery.
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
`database_cluster`, and `database_proxy`. A database instance uses its explicit
`clusterId` first; only an unambiguous outgoing `member_of` relation to a
database cluster fills a missing parent, so conflicting relation records remain
visible without inventing a parent.

Overview view models use the paginating resource helper and derive attention
from the same scoped complete list, retaining an optional environment filter.

Resource name, alias, and external-identifier conflicts each have a distinct code.

## Interfaces

- `parseResourceListSearchParams` preserves the structured Inventory search contract while dropping pagination snapshots from saved views.
- `parseAuditListSearchParams` normalizes audit pagination, environment URL state, and repeated filters.
- `parsePositiveDecimalInteger` accepts only safe positive decimal URL IDs.

## Dependencies

- Upstream: Next.js route search params and transport types
- Downstream: app routes and services
# Resource summaries

`resource-summary.ts` centralizes root-translator resource and relation type labels with readable fallbacks.
