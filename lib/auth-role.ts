// input: react
// output: useAdminRole presentation-only admin gate from role storage/cookies
// pos: UI role recovery after 38X-1A tokens no longer embed role
// note: if this file changes, update header and lib/README.md
/**
 * Presentation-only admin-role detection for UI gating.
 *
 * Backend 38X-1A+ bearer tokens no longer embed role:
 *
 *   base64.RawURLEncoding( "<id>:<authorizationVersion>:<issuedAtUnix>:<hexHMAC>" )
 *
 * Role for UI gating comes from login response storage (`controlhub.role`
 * sessionStorage + cookie). Legacy tokens that still embed `<id>:<role>:...`
 * remain decodable as a fallback.
 *
 * **Security boundary:** This module does NOT verify the HMAC signature.
 * The frontend has no access to the signing key and cannot authenticate
 * the token.  The decoded role is a *presentation-only hint* used to
 * show or hide admin UI controls.  All actual authorization (PUT/DELETE
 * credential metadata, query execution, etc.) is enforced server-side
 * by the backend's token verification and role check middleware.
 * A tampered token would surface a wrong UI gate but would be rejected
 * by the backend on any protected API call.
 *
 * Fail-closed: malformed, missing, or undecodable tokens resolve to
 * `false` (non-admin UI).
 *
 * Direct-URL / new-tab scenario:
 *   sessionStorage may be empty. Login sets `controlhub.token` and
 *   `controlhub.role` cookies. Prefer the role cookie (backend 38X-1A+
 *   tokens no longer embed role). Legacy tokens that still embed role
 *   remain decodable as a fallback. Backfill sessionStorage on recovery.
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
 *
 * NOTE: This is a *client-side decode only* — it does NOT verify the
 * HMAC signature.  The decoded role is trusted only for UI gating;
 * server-side middleware enforces real authorization.
 *
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
function readCookieValue(name: string): string | null {
  try {
    const prefix = `${name}=`;
    const match = document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith(prefix));
    if (!match) return null;
    return match.slice(prefix.length) || null;
  } catch {
    return null;
  }
}

function readTokenFromCookie(): string | null {
  return readCookieValue("controlhub.token");
}

function readRoleFromCookie(): string | null {
  return readCookieValue("controlhub.role");
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
 * 1. `sessionStorage["controlhub.role"]` — set at login time.
 * 2. `document.cookie` `controlhub.role` (direct URL / new-tab; 38X-1A+).
 * 3. Decode role from `sessionStorage["controlhub.token"]` (legacy tokens).
 * 4. Decode role from `document.cookie` `controlhub.token` (legacy tokens).
 * 5. `false` (unauthenticated / malformed — fail closed to non-admin UI).
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

      // 2. Role cookie (backend tokens no longer embed role)
      const cookieRole = readRoleFromCookie();
      if (cookieRole) {
        window.sessionStorage.setItem("controlhub.role", cookieRole);
        const cookieToken = readTokenFromCookie();
        if (cookieToken) {
          window.sessionStorage.setItem("controlhub.token", cookieToken);
        }
        setIsAdmin(cookieRole === "admin");
        return;
      }

      // 3. Legacy: decode from sessionStorage token
      const sessionToken = window.sessionStorage.getItem("controlhub.token");
      if (sessionToken) {
        const role = decodeRoleFromRawToken(sessionToken);
        // New tokens decode to authorizationVersion (numeric), not a role name.
        if (role === "admin" || role === "editor" || role === "viewer") {
          window.sessionStorage.setItem("controlhub.role", role);
          setIsAdmin(role === "admin");
          return;
        }
      }

      // 4. Legacy: decode from token cookie
      const cookieToken = readTokenFromCookie();
      if (cookieToken) {
        const role = decodeRoleFromRawToken(cookieToken);
        if (role === "admin" || role === "editor" || role === "viewer") {
          window.sessionStorage.setItem("controlhub.token", cookieToken);
          window.sessionStorage.setItem("controlhub.role", role);
          setIsAdmin(role === "admin");
          return;
        }
      }

      // 5. Fail closed: no valid role → non-admin UI
      setIsAdmin(false);
    } catch {
      setIsAdmin(false);
    }
  }, []);

  return isAdmin;
}
