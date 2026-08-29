// input: react, same-origin /api/operator-session
// output: useAdminRole presentation-only admin gate from trusted BFF session identity
// pos: UI role lookup from the sealed Operator Session
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

/**
 * Resolve the current user's admin status for UI gating from the sealed BFF
 * session. Browser storage and readable cookies are untrusted input.
 *
 * This is a **presentation-only hint**.  The decoded role controls
 * whether admin UI controls (credential edit forms, settings links)
 * are rendered.  It does NOT authorize any action — all protected
 * API calls go through the backend which verifies the token signature
 * and enforces role-based access control server-side.
 *
 * The hook is hydration-safe: it returns `null` during SSR and the first
 * client render, then fetches the same-origin session endpoint.
 */
export function useAdminRole(): boolean | null {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/operator-session", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = (await response.json()) as { role?: unknown };
        return body.role === "admin";
      })
      .then((admin) => {
        if (active) setIsAdmin(admin);
      })
      .catch(() => {
        if (active) setIsAdmin(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return isAdmin;
}
