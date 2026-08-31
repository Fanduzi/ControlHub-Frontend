// input: next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/constants, @/lib/operator-session/session-cookie
// output: console route guard requiring a valid unexpired Operator Session; invalid sessions fail closed to login with the protected path and query preserved
// pos: authentication-boundary gate for console pages
// note: if this file changes, update header and README.md
import { NextRequest, NextResponse } from "next/server";

import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { unsealSession } from "@/lib/operator-session/seal";
import { clearSessionCookie } from "@/lib/operator-session/session-cookie";

function redirectToLogin(
  request: NextRequest,
  returnTo: string,
  reason?: string,
): NextResponse {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", returnTo);
  if (reason) loginUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(loginUrl);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // BFF API routes are their own boundary; the page gate does not apply.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Only a valid, authenticated, unexpired Sealed Operator Session passes.
  // A browser bearer cookie is never a page or API authorization path.
  const operatorSession = request.cookies.get(SESSION_COOKIE_NAME);
  const config = loadOperatorSessionConfig();
  const sessionValid =
    operatorSession?.value !== undefined && config.ok
      ? unsealSession(operatorSession.value, config.value, Date.now()).ok
      : false;

  if (pathname === "/login") {
    if (sessionValid) {
      // A live session behind the login form is a logged-out presentation
      // with a usable operator session — send the operator to the console.
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    if (operatorSession?.value) {
      // Forged/tampered/expired session cookie: clear it, then show login.
      const response = NextResponse.next();
      clearSessionCookie(
        response,
        config.ok ? config.value.secureCookies : true,
      );
      return response;
    }
    return NextResponse.next();
  }

  if (sessionValid) {
    return NextResponse.next();
  }

  const response = redirectToLogin(
    request,
    `${pathname}${search}`,
    operatorSession?.value ? "session-expired" : undefined,
  );
  if (operatorSession?.value) {
    clearSessionCookie(
      response,
      config.ok ? config.value.secureCookies : true,
    );
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|openapi.yaml|docs).*)",
  ],
};
