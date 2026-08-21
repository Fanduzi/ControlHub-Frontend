# lib

Shared frontend libraries.

`auth-role.ts` recovers the presentation-only admin gate from `controlhub.role`
storage/cookies. It does not read or decode Backend Bearer Credentials.
Operator Session BFF primitives live in `lib/operator-session/`.

`navigation.ts` marks the audits entry `adminOnly`; sidebar and command
palette hide it for non-admin operators, mirroring the server-owned access
matrix.

`controlled-error-codes.ts` is the closed console union of Controlled Error
Codes. It must match OpenAPI `ErrorResponse.error` and is not generated.
`scripts/check-controlled-error-codes.mjs` fails when the two sets drift.
