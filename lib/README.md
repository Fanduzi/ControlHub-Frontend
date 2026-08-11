# lib

Shared frontend libraries.

`auth-role.ts` recovers the presentation-only admin gate from `controlhub.role`
storage/cookies. It does not read or decode Backend Bearer Credentials.
Operator Session BFF primitives live in `lib/operator-session/`.
