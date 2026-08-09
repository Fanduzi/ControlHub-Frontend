// input: next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/constants, @/lib/operator-session/session-cookie
// output: console route guard requiring a valid unexpired Operator Session or the legacy token cookie (proxy.ts)
// pos: authentication-boundary gate for console pages; forged/tampered/unknown-key/expired sessions fail closed to login
// note: if this file changes, update header and README.md
import { NextRequest, NextResponse } from "next/server";

import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import {
  LEGACY_TOKEN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/operator-session/constants";
import { unsealSession } from "@/lib/operator-session/seal";
import { clearSessionCookie } from "@/lib/operator-session/session-cookie";

const PUBLIC_PATHS = ["/login", "/api", "/__api"];

function redirectToLogin(
  request: NextRequest,
  pathname: string,
): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Legacy seam: the browser-readable token cookie set by the pre-BFF login
  // flow remains accepted until the #15 console migration removes it.
  const cookie = request.cookies.get(LEGACY_TOKEN_COOKIE_NAME);
  if (cookie?.value) {
    return NextResponse.next();
  }

  // BFF boundary: only a valid, authenticated, unexpired Sealed Operator
  // Session passes. A forged, tampered, unknown-key, expired, or
  // unverifiable cookie value fails closed to the login page and is
  // cleared; an invalid BFF configuration also fails closed.
  const operatorSession = request.cookies.get(SESSION_COOKIE_NAME);
  if (operatorSession?.value) {
    const config = loadOperatorSessionConfig();
    let sessionValid = false;
    if (config.ok) {
      sessionValid = unsealSession(
        operatorSession.value,
        config.value,
        Date.now(),
      ).ok;
    }
    if (sessionValid) {
      return NextResponse.next();
    }
    const response = redirectToLogin(request, pathname);
    clearSessionCookie(response, config.ok ? config.value.secureCookies : true);
    return response;
  }

  return redirectToLogin(request, pathname);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|openapi.yaml|docs).*)",
  ],
};
