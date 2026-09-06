// input: next/server, operator-session config/seal/origin/cookie/backend/response
// output: Operator Session facade (login, logout, readIdentity, authenticateCookie, gatePage)
// pos: one fail-closed Operator Session module; HTTP routes are adapters
// note: if this file changes, update header and lib/operator-session/README.md
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { performBackendLogin } from "@/lib/operator-session/backend";
import {
  loadOperatorSessionConfig,
  type OperatorSessionConfig,
} from "@/lib/operator-session/config";
import { SESSION_COOKIE_NAME } from "@/lib/operator-session/constants";
import { isUnsafeMethod, originAllowed } from "@/lib/operator-session/origin";
import { bffJson } from "@/lib/operator-session/response";
import { sealSession, unsealSession, type SealedSessionPayload } from "@/lib/operator-session/seal";
import { clearSessionCookie, setSessionCookie } from "@/lib/operator-session/session-cookie";

export type CookieAuth =
  | { ok: true; config: OperatorSessionConfig; payload: SealedSessionPayload }
  | { ok: false; response: NextResponse };

function rejectCrossOrigin(
  request: NextRequest,
  config: OperatorSessionConfig,
): NextResponse | null {
  if (isUnsafeMethod(request.method) && !originAllowed(request, config.consoleOrigin)) {
    return bffJson(403, "forbidden");
  }
  return null;
}

/**
 * Interactive login: backend login server-side, seal the bearer and trusted
 * operator identity into the Operator Session cookie, return identity + role
 * without the credential.
 */
export async function login(request: NextRequest): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  const originError = rejectCrossOrigin(request, config.value);
  if (originError) return originError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return bffJson(400, "invalid-request");
  }

  const { email, password } =
    typeof body === "object" && body !== null
      ? (body as { email?: unknown; password?: unknown })
      : {};
  if (
    typeof email !== "string" ||
    email.length === 0 ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return bffJson(400, "invalid-request");
  }

  const outcome = await performBackendLogin(email, password);
  if (!outcome.ok) {
    return outcome.kind === "invalid-credentials"
      ? bffJson(401, "unauthorized")
      : bffJson(503, "service-unavailable");
  }

  const sealed = sealSession(
    {
      token: outcome.token,
      role: outcome.role,
      email: outcome.email,
      ...(outcome.displayName ? { displayName: outcome.displayName } : {}),
    },
    config.value,
  );
  const response = NextResponse.json(
    {
      email: outcome.email,
      ...(outcome.displayName ? { displayName: outcome.displayName } : {}),
      role: outcome.role,
    },
    { headers: { "cache-control": "no-store" } },
  );
  setSessionCookie(response, sealed, config.value.secureCookies);
  return response;
}

/** Logout: clear the Operator Session cookie. */
export async function logout(request: NextRequest): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  const originError = rejectCrossOrigin(request, config.value);
  if (originError) return originError;

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearSessionCookie(response, config.value.secureCookies);
  return response;
}

/**
 * Read the Operator Session cookie. Missing, malformed, tampered, expired,
 * and unknown-key cookies all produce the same 401. Rejected cookies are
 * cleared. A missing cookie is 401 without a clear.
 */
export function authenticateCookie(request: NextRequest): CookieAuth {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return { ok: false, response: bffJson(503, "service-unavailable") };
  }

  const sealed = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sealed) {
    return { ok: false, response: bffJson(401, "unauthorized") };
  }

  const unsealed = unsealSession(sealed, config.value, Date.now());
  if (!unsealed.ok) {
    const response = bffJson(401, "unauthorized");
    clearSessionCookie(response, config.value.secureCookies);
    return { ok: false, response };
  }

  return { ok: true, config: config.value, payload: unsealed.payload };
}

/**
 * Read the authenticated operator email/display name and role from the sealed
 * session. Never returns the Backend Bearer Credential.
 */
export function readIdentity(request: NextRequest): NextResponse {
  const auth = authenticateCookie(request);
  if (!auth.ok) return auth.response;
  const { email, displayName, role } = auth.payload;
  return NextResponse.json(
    {
      ...(email ? { email } : {}),
      ...(displayName ? { displayName } : {}),
      role,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

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

/**
 * Console page gate. `/api` is not gated here. Login with a live session
 * redirects to overview. Invalid cookies are cleared. The protected path and
 * query are preserved on the login return target.
 */
export function gatePage(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const operatorSession = request.cookies.get(SESSION_COOKIE_NAME);
  const config = loadOperatorSessionConfig();
  const sessionValid =
    operatorSession?.value !== undefined && config.ok
      ? unsealSession(operatorSession.value, config.value, Date.now()).ok
      : false;

  if (pathname === "/login") {
    if (sessionValid) {
      return NextResponse.redirect(new URL("/overview", request.url));
    }
    if (operatorSession?.value) {
      const response = NextResponse.next();
      clearSessionCookie(response, config.ok ? config.value.secureCookies : true);
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
    clearSessionCookie(response, config.ok ? config.value.secureCookies : true);
  }
  return response;
}
