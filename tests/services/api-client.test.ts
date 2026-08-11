// input: vitest, api-client
// output: tests for resolveApiBaseUrl, unsafe integers, browser BFF path, BFF 401 session handling
// pos: unit tests for shared API client
// note: if this file changes, update header and tests/services/README.md
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient, ApiError, resolveApiBaseUrl } from "@/services/api-client";

describe("resolveApiBaseUrl", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  it("uses the BFF proxy in the browser", () => {
    globalThis.window = {} as Window & typeof globalThis;
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/__api");
    expect(resolveApiBaseUrl()).toBe("/api/proxy");
  });

  it("uses the BFF origin on the server when set", () => {
    // @ts-expect-error test server runtime
    delete globalThis.window;
    vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", "http://localhost:3100");
    expect(resolveApiBaseUrl()).toBe("http://localhost:3100");
  });

  it("uses the default BFF origin when no console origin is set", () => {
    // @ts-expect-error test server runtime
    delete globalThis.window;
    vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", "");
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://localhost:8081");
    expect(resolveApiBaseUrl()).toBe("http://localhost:3000");
  });

  it("uses localhost BFF on the server by default", () => {
    // @ts-expect-error test server runtime
    delete globalThis.window;
    vi.stubEnv("CONTROLHUB_BFF_CONSOLE_ORIGIN", "");
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("apiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects unsafe integer values in JSON responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 9_007_199_254_740_992,
      }),
    } as Response);

    await expect(apiClient<{ id: number }>("/resources/1")).rejects.toThrow(
      /unsafe integer/i,
    );
  });

  it("returns safe integer values unchanged", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 9_007_199_254_740_991,
      }),
    } as Response);

    await expect(apiClient<{ id: number }>("/resources/1")).resolves.toEqual({
      id: 9_007_199_254_740_991,
    });
  });

  it("surfaces API errors with parsed message and details", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        message: "Bad request",
        details: { id: "invalid" },
      }),
    } as Response);

    await expect(apiClient("/resources/1")).rejects.toEqual(
      new ApiError(400, "Bad request", { id: "invalid" }),
    );
  });

  it("does not attach Authorization or retain browser bearer storage", async () => {
    const getItem = vi.fn(() => null);
    vi.stubGlobal("window", {
      sessionStorage: { getItem, removeItem: vi.fn() },
      location: { href: "http://localhost:3100/overview" },
    });
    vi.stubGlobal("document", { cookie: "" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    await expect(apiClient("/health")).resolves.toEqual({ ok: true });
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBeNull();
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/api/proxy");
  });

  it("redirects browser 401 to login and clears presentation state", async () => {
    const hrefOwner = { href: "http://localhost:3100/overview" };
    const removeItem = vi.fn();
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => "admin", removeItem },
      location: hrefOwner,
    });
    vi.stubGlobal("document", { cookie: "controlhub.role=admin" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "unauthorized" }),
    } as Response);

    await expect(apiClient("/environments")).rejects.toEqual(
      new ApiError(401, "unauthorized"),
    );
    expect(hrefOwner.href).toBe("/login?reason=session-expired");
    expect(removeItem).toHaveBeenCalledWith("controlhub.role");
  });
});
