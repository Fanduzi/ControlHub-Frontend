// input: vitest, testing-library, useAdminRole
// output: tests for admin role recovery including role cookie and legacy tokens
// pos: unit tests for presentation-only admin gate
// note: if this file changes, update header and tests/lib/README.md
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdminRole } from "@/lib/auth-role";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a fake bearer token that mirrors the backend format:
 *   base64.RawURLEncoding( "<id>:<role>:<ts>:<hexSig>" )
 *
 * We use a deterministic hex signature (64 chars) — the frontend never
 * verifies the HMAC, it only reads the role field after decoding.
 */
function buildFakeToken(userId: number, role: string): string {
  const payload = `${userId}:${role}:1751721600:${"a".repeat(64)}`;
  // base64url encode: standard btoa + URL-safe substitutions + strip padding
  const encoded = btoa(payload)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return encoded;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAdminRole", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    // Clear cookies by setting expiry in the past
    document.cookie = "controlhub.token=; path=/; max-age=0";
    document.cookie = "controlhub.role=; path=/; max-age=0";
  });

  it("resolves to false when no auth data exists (hydration-safe initial null)", async () => {
    // In jsdom, useEffect runs synchronously so we cannot catch the initial
    // null state.  The hook initializes with useState(null) which guarantees
    // SSR/client first-render match.  Here we verify the final resolved state.
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("resolves admin=true from sessionStorage role", async () => {
    window.sessionStorage.setItem("controlhub.role", "admin");
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("resolves admin=false from sessionStorage role (viewer)", async () => {
    window.sessionStorage.setItem("controlhub.role", "viewer");
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("decodes admin role from sessionStorage token when role is missing", async () => {
    const token = buildFakeToken(42, "admin");
    window.sessionStorage.setItem("controlhub.token", token);
    // role is NOT set

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));

    // Should have backfilled the role
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
  });

  it("decodes viewer role from sessionStorage token", async () => {
    const token = buildFakeToken(7, "viewer");
    window.sessionStorage.setItem("controlhub.token", token);

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("viewer");
  });

  it("falls back to controlhub.role cookie when sessionStorage is empty (38X-1A+)", async () => {
    // New tokens embed authorizationVersion, not role — UI recovery uses the role cookie.
    const token = buildFakeToken(99, "1");
    document.cookie = `controlhub.token=${token}; path=/; max-age=86400`;
    document.cookie = `controlhub.role=admin; path=/; max-age=86400`;

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));

    expect(window.sessionStorage.getItem("controlhub.token")).toBe(token);
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
  });

  it("falls back to legacy cookie token role when role cookie is absent", async () => {
    const token = buildFakeToken(99, "admin");
    document.cookie = `controlhub.token=${token}; path=/; max-age=86400`;

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));

    expect(window.sessionStorage.getItem("controlhub.token")).toBe(token);
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
  });

  it("does not treat authorizationVersion as a role name", async () => {
    // 38X-1A payload: id:authorizationVersion:issuedAt — index 1 is "1", not admin.
    const token = buildFakeToken(1, "1");
    window.sessionStorage.setItem("controlhub.token", token);

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBeNull();
  });

  it("falls back to cookie token for non-admin role", async () => {
    const token = buildFakeToken(5, "viewer");
    document.cookie = `controlhub.token=${token}; path=/; max-age=86400`;

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("viewer");
  });

  it("returns false for a malformed token", async () => {
    window.sessionStorage.setItem("controlhub.token", "not-a-valid-base64-token");

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("returns false when no token or role exists anywhere", async () => {
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    // No sessionStorage backfill should have happened
    expect(window.sessionStorage.getItem("controlhub.role")).toBeNull();
    expect(window.sessionStorage.getItem("controlhub.token")).toBeNull();
  });

  it("prefers sessionStorage role over token decode", async () => {
    // Token says "viewer", but sessionStorage role says "admin"
    const token = buildFakeToken(42, "viewer");
    window.sessionStorage.setItem("controlhub.token", token);
    window.sessionStorage.setItem("controlhub.role", "admin");

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("prefers sessionStorage token decode over cookie", async () => {
    // sessionStorage token says "admin", cookie says "viewer"
    const sessionToken = buildFakeToken(42, "admin");
    const cookieToken = buildFakeToken(7, "viewer");
    window.sessionStorage.setItem("controlhub.token", sessionToken);
    document.cookie = `controlhub.token=${cookieToken}; path=/; max-age=86400`;

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
