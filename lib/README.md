# lib

Shared frontend libraries.

`auth-role.ts` recovers the presentation-only admin gate from `controlhub.role`
storage/cookies. It does not read or decode Backend Bearer Credentials.
Operator Session BFF primitives live in `lib/operator-session/`.

`navigation.ts` marks the audits entry `adminOnly`; sidebar and command
palette hide it for non-admin operators, mirroring the server-owned access
matrix.

`environment-params.ts` resolves environment slugs for inventory list pages;
unknown slugs fail closed so those pages render an empty scoped result.

`controlled-error-codes.ts` is the closed console union of Controlled Error
Codes. It must match OpenAPI `ErrorResponse.error` and is not generated.
`scripts/check-controlled-error-codes.mjs` fails when the two sets drift.
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

Resource name, alias, and external-identifier conflicts each have a distinct code.
