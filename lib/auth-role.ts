/**
 * Shared admin-role detection helper.
 *
 * The bearer token created by the backend has the form:
 *
 *   base64.RawURLEncoding( "<id>:<role>:<issuedAtUnix>:<hexHMAC>" )
 *
 * To recover the role we base64url-decode the token, split on ":", and
 * read index 1.  This does NOT fabricate admin status — the server
 * embedded the role in the signed token at login time.
 *
 * Direct-URL / new-tab scenario:
 *   sessionStorage may be empty, but the login flow also sets a
 *   `controlhub.token` cookie.  When sessionStorage token is missing
 *   we fall back to the cookie, decode the role, and backfill both
 *   sessionStorage["controlhub.token"] and sessionStorage["controlhub.role"]
 *   so subsequent reads are fast.
 */

"use client";

import { useEffect, useState } from "react";

/**
 * Base64url-decode a string (URL-safe alphabet, no padding).
 * Returns the decoded UTF-8 string, or `null` on failure.
 */
function base64UrlDecode(encoded: string): string | null {
  try {
    // Convert URL-safe alphabet to standard, add padding
    const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * Extract the role string from a raw bearer token string.
 * The token is base64url-encoded `<id>:<role>:<ts>:<hexSig>`.
 * Returns `null` when the token is missing or malformed.
 */
function decodeRoleFromRawToken(token: string): string | null {
  if (!token) return null;
  const decoded = base64UrlDecode(token);
  if (!decoded) return null;
  // Split on ":" — payload is "<id>:<role>:<ts>", then ":<hexSig>"
  const parts = decoded.split(":");
  if (parts.length < 2) return null;
  return parts[1] ?? null;
}

/**
 * Read the `controlhub.token` value from `document.cookie`.
 * Returns the token string or `null` if not present.
 */
function readTokenFromCookie(): string | null {
  try {
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("controlhub.token="));
    if (!match) return null;
    return match.split("=").slice(1).join("=") || null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's admin status.
 *
 * Resolution order:
 * 1. `sessionStorage["controlhub.role"]` — set at login time.
 * 2. Decode role from `sessionStorage["controlhub.token"]`.
 * 3. Decode role from `document.cookie` `controlhub.token` (direct URL /
 *    new-tab scenario).  Backfills sessionStorage for subsequent reads.
 * 4. `false` (unauthenticated / malformed).
 *
 * The hook is hydration-safe: it returns `null` during SSR and the first
 * client render, then resolves in a `useEffect`.
 */
export function useAdminRole(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      // 1. Fast path: role already cached
      const storedRole = window.sessionStorage.getItem("controlhub.role");
      if (storedRole) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsAdmin(storedRole === "admin");
        return;
      }

      // 2. Decode from sessionStorage token
      const sessionToken = window.sessionStorage.getItem("controlhub.token");
      if (sessionToken) {
        const role = decodeRoleFromRawToken(sessionToken);
        if (role) {
          window.sessionStorage.setItem("controlhub.role", role);
          setIsAdmin(role === "admin");
          return;
        }
      }

      // 3. Cookie fallback (direct URL / new tab)
      const cookieToken = readTokenFromCookie();
      if (cookieToken) {
        const role = decodeRoleFromRawToken(cookieToken);
        if (role) {
          // Backfill sessionStorage so future reads are fast
          window.sessionStorage.setItem("controlhub.token", cookieToken);
          window.sessionStorage.setItem("controlhub.role", role);
          setIsAdmin(role === "admin");
          return;
        }
      }

      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  return isAdmin;
}
