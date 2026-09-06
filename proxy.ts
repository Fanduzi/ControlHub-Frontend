// input: next/server, @/lib/operator-session/facade
// output: console page gate via Operator Session facade; invalid sessions fail closed to login with the protected path and query preserved
// pos: thin adapter over gatePage
// note: if this file changes, update header and README.md
import type { NextRequest } from "next/server";

import { gatePage } from "@/lib/operator-session/facade";

export function proxy(request: NextRequest) {
  return gatePage(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|openapi.yaml|docs).*)",
  ],
};
