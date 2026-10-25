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
