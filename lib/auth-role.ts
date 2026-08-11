// input: react
// output: useAdminRole presentation-only admin gate from role storage/cookies
// pos: UI role recovery from BFF presentation role state
// note: if this file changes, update header and lib/README.md
/**
 * Presentation-only admin-role detection for the BFF login role state.
 *
 * The Backend Bearer Credential is sealed in an HttpOnly Operator Session and
 * is never readable by this module. The role is only a UI hint; server-side
 * authorization remains authoritative.
 */

"use client";

import { useEffect, useState } from "react";

function readRoleFromCookie(): string | null {
  try {
    const prefix = "controlhub.role=";
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(prefix));
    return match ? match.slice(prefix.length) || null : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current user's admin status for UI gating.
 *
 * This is a **presentation-only hint**.  The decoded role controls
 * whether admin UI controls (credential edit forms, settings links)
 * are rendered.  It does NOT authorize any action — all protected
 * API calls go through the backend which verifies the token signature
 * and enforces role-based access control server-side.
 *
 * Resolution order:
 * 1. `sessionStorage["controlhub.role"]` — set at BFF login time.
 * 2. `document.cookie` `controlhub.role` (direct URL / new-tab).
 * 3. `false` (unauthenticated / malformed — fail closed to non-admin UI).
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

      // 2. Role cookie (presentation-only BFF login state).
      const cookieRole = readRoleFromCookie();
      if (cookieRole) {
        window.sessionStorage.setItem("controlhub.role", cookieRole);
        setIsAdmin(cookieRole === "admin");
        return;
      }

      // 3. Fail closed: no valid role → non-admin UI
      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  return isAdmin;
}
