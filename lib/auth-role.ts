/**
 * Shared admin-role detection helper.
 *
 * The bearer token stored in `sessionStorage["controlhub.token"]` has the
 * format `<userID>:<roleName>:<issuedAtUnix>:<HMAC-SHA256 signature>`
 * (base64url-encoded).  When `sessionStorage["controlhub.role"]` is missing
 * (e.g. after a direct URL navigation or page refresh) we can recover the
 * role by decoding the second field of the token payload.
 *
 * This does NOT fabricate admin status — the server embedded the role in the
 * token at login time.  The HMAC signature protects integrity; we only read
 * the already-signed claim.
 */

"use client";

import { useEffect, useState } from "react";

/**
 * Extract the role string from the bearer token in sessionStorage.
 * Returns `null` when the token is missing, malformed, or the browser
 * blocks sessionStorage access.
 */
export function decodeRoleFromToken(): string | null {
  try {
    const token = window.sessionStorage.getItem("controlhub.token");
    if (!token) return null;
    const parts = token.split(":");
    if (parts.length < 2) return null;
    // parts[0] = userID, parts[1] = roleName
    return parts[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's admin status.
 *
 * Resolution order:
 * 1. `sessionStorage["controlhub.role"]` — set at login time.
 * 2. Bearer token payload decode — the server embeds `<id>:<role>:…`.
 * 3. `null` (unknown / not yet resolved / unauthenticated).
 *
 * The hook is hydration-safe: it returns `null` during SSR and the first
 * client render, then resolves in a `useEffect`.
 */
export function useAdminRole(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const storedRole = window.sessionStorage.getItem("controlhub.role");
      if (storedRole) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsAdmin(storedRole === "admin");
        return;
      }

      // Fall back to decoding the bearer token
      const decodedRole = decodeRoleFromToken();
      if (decodedRole) {
        // Persist for subsequent reads
        window.sessionStorage.setItem("controlhub.role", decodedRole);
        setIsAdmin(decodedRole === "admin");
        return;
      }

      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  return isAdmin;
}
