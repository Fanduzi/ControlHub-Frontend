// input: vitest, testing-library, useAdminRole
// output: tests for admin role recovery from BFF presentation role state
// pos: unit tests for presentation-only admin gate
// note: if this file changes, update header and tests/lib/README.md
import { describe, it, expect, beforeEach } from "vitest";
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

  it("fails closed when no role state exists", async () => {
    const token = btoa("42:admin:1751721600:" + "a".repeat(64));
    window.sessionStorage.setItem("controlhub.token", token);

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBeNull();
  });

  it("falls back to controlhub.role cookie when sessionStorage is empty (38X-1A+)", async () => {
    document.cookie = `controlhub.role=admin; path=/; max-age=86400`;

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));

    // Role is backfilled from the presentation cookie for a direct URL.
    expect(window.sessionStorage.getItem("controlhub.role")).toBe("admin");
  });

  it("ignores a browser bearer cookie", async () => {
    document.cookie = "controlhub.token=browser-bearer; path=/; max-age=86400";

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBeNull();
  });

  it("does not promote a token-shaped session value", async () => {
    window.sessionStorage.setItem("controlhub.token", "token-shaped-value");

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(false));
    expect(window.sessionStorage.getItem("controlhub.role")).toBeNull();
  });

  it("does not let a browser bearer-shaped role override presentation state", async () => {
    window.sessionStorage.setItem("controlhub.token", "legacy-token");
    window.sessionStorage.setItem("controlhub.role", "admin");

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("prefers sessionStorage role over role cookie", async () => {
    window.sessionStorage.setItem("controlhub.role", "admin");
    document.cookie = "controlhub.role=viewer; path=/; max-age=86400";

    const { result } = renderHook(() => useAdminRole());
    await waitFor(() => expect(result.current).toBe(true));
  });
});
