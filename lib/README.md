# lib

Shared frontend libraries.

`auth-role.ts` recovers the presentation-only admin gate from `controlhub.role` storage/cookies (never promotes legacy bearer cookies into sessionStorage). Operator Session BFF primitives live in `lib/operator-session/`.
