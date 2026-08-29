// input: vitest, testing-library, useAdminRole
// output: tests for admin role recovery from trusted BFF session identity
// pos: unit tests for the fail-closed presentation-only admin gate
// note: if this file changes, update header and tests/lib/README.md
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useAdminRole } from "@/lib/auth-role";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAdminRole", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    document.cookie = "controlhub.role=; path=/; max-age=0";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("resolves to false when no auth data exists (hydration-safe initial null)", async () => {
    // In jsdom, useEffect runs synchronously so we cannot catch the initial
    // null state.  The hook initializes with useState(null) which guarantees
    // SSR/client first-render match.  Here we verify the final resolved state.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("resolves admin=true only from the trusted BFF session response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ role: "admin" }), { status: 200 }),
      ),
    );
    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("does not grant admin UI from tampered browser role state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ role: "viewer" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    window.sessionStorage.setItem("controlhub.role", "admin");
    document.cookie = "controlhub.role=admin; path=/; max-age=86400";

    const { result } = renderHook(() => useAdminRole());

    await waitFor(() => expect(result.current).toBe(false));
    expect(fetchMock).toHaveBeenCalledWith("/api/operator-session", {
      cache: "no-store",
    });
  });
});
