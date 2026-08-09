// input: next/server, @/lib/operator-session/constants
// output: shared Operator Session cookie set/clear helpers (HttpOnly, SameSite=Strict, path, Secure policy)
// pos: single source of truth for Operator Session cookie attributes across BFF routes
// note: if this file changes, update header and lib/operator-session/README.md
import type { NextResponse } from "next/server";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/operator-session/constants";

/**
 * Set the Operator Session cookie with the boundary-invariant attributes:
 * HttpOnly, SameSite=Strict, Path=/, and the configured Secure policy.
 */
export function setSessionCookie(
  response: NextResponse,
  value: string,
  secure: boolean,
  maxAge: number = SESSION_MAX_AGE_SECONDS,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge,
  });
}

/** Clear the Operator Session cookie (logout and rejected-session handling). */
export function clearSessionCookie(
  response: NextResponse,
  secure: boolean,
): void {
  setSessionCookie(response, "", secure, 0);
}
