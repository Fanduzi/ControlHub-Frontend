// input: next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/constants, @/lib/operator-session/session-cookie
// output: console route guard requiring a valid unexpired Operator Session
// pos: authentication-boundary gate for console pages; forged/tampered/unknown-key/expired sessions fail closed to login
// note: if this file changes, update header and README.md
import { NextRequest, NextResponse } from "next/server";

import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { unsealSession } from "@/lib/operator-session/seal";
import { clearSessionCookie } from "@/lib/operator-session/session-cookie";

const PUBLIC_PATHS = ["/login", "/api"];

function redirectToLogin(
  request: NextRequest,
  pathname: string,
  reason?: string,
): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  if (reason) loginUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  // Only a valid, authenticated, unexpired Sealed Operator Session passes.
  // A browser bearer cookie is never a page or API authorization path.
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
    const response = redirectToLogin(request, pathname, "session-expired");
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
