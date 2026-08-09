// input: next/server, @/lib/operator-session/constants
// output: console route guard accepting a legacy token cookie or a BFF Operator Session cookie
// pos: authentication-boundary gate for console pages; BFF sessions pass without browser-readable tokens
// note: if this file changes, update header and README.md
import { NextRequest, NextResponse } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";

const PUBLIC_PATHS = ["/login", "/api", "/__api"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Legacy seam: the browser-readable token cookie set by the pre-BFF login
  // flow remains accepted until the #15 console migration removes it.
  const cookie = request.cookies.get("controlhub.token");
  // BFF boundary: the HttpOnly sealed Operator Session cookie.
  const operatorSession = request.cookies.get(SESSION_COOKIE_NAME);
  if (!cookie?.value && !operatorSession?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|openapi.yaml|docs).*)",
  ],
};
