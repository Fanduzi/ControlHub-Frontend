// input: next/server, @/lib/operator-session/config, @/lib/operator-session/seal, @/lib/operator-session/backend, @/lib/operator-session/origin, @/lib/operator-session/constants, @/lib/operator-session/session-cookie
// output: Console BFF session routes — POST login (sealed HttpOnly cookie), DELETE logout
// pos: same-origin Operator Session boundary; the BFF is the only translator from session to Backend Bearer Credential
// note: if this file changes, update header and app/api/operator-session/README.md
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { performBackendLogin } from "@/lib/operator-session/backend";
import { loadOperatorSessionConfig } from "@/lib/operator-session/config";
import { isUnsafeMethod, originAllowed } from "@/lib/operator-session/origin";
import { sealSession } from "@/lib/operator-session/seal";
import { bffJson } from "@/lib/operator-session/response";
import { clearSessionCookie, setSessionCookie } from "@/lib/operator-session/session-cookie";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Interactive login: the BFF calls the existing backend login API
 * server-side, seals the resulting Backend Bearer Credential into an
 * HttpOnly Operator Session cookie, and returns only the role. The bearer
 * credential never appears in the response body, browser storage, or logs.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  if (
    isUnsafeMethod(request.method) &&
    !originAllowed(request, config.value.consoleOrigin)
  ) {
    return bffJson(403, "forbidden");
  }

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
    // One controlled unauthenticated outcome for invalid credentials; a
    // generic unavailable outcome when the backend itself is unreachable.
    // Neither response ever carries backend failure details.
    return outcome.kind === "invalid-credentials"
      ? bffJson(401, "unauthorized")
      : bffJson(503, "service-unavailable");
  }

  const sealed = sealSession(
    { token: outcome.token, role: outcome.role },
    config.value,
  );

  const response = NextResponse.json({ role: outcome.role }, { headers: { "cache-control": "no-store" } });
  setSessionCookie(response, sealed, config.value.secureCookies);
  return response;
}

/** Logout: clear the Operator Session cookie. */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const config = loadOperatorSessionConfig();
  if (!config.ok) {
    return bffJson(503, "service-unavailable");
  }

  if (
    isUnsafeMethod(request.method) &&
    !originAllowed(request, config.value.consoleOrigin)
  ) {
    return bffJson(403, "forbidden");
  }

  const response = NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  clearSessionCookie(response, config.value.secureCookies);
  return response;
}
