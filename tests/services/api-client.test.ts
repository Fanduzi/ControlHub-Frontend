// input: vitest, api-client
// output: tests for resolveApiBaseUrl, unsafe integers, credentialed 401 handling, cookie auth
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

  it("uses the BFF proxy in the browser when no legacy token is present", () => {
    globalThis.window = {
      sessionStorage: { getItem: () => null },
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("document", { cookie: "" });
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("/api/proxy");
  });

  it("uses /__api in the browser when a legacy token is present", () => {
    globalThis.window = {
      sessionStorage: {
        getItem: (key: string) =>
          key === "controlhub.token" ? "legacy-token" : null,
      },
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("document", { cookie: "" });
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("/__api");
  });

  it("uses NEXT_PUBLIC_API_BASE_URL in the browser when a legacy token is present", () => {
    globalThis.window = {
      sessionStorage: {
        getItem: (key: string) =>
          key === "controlhub.token" ? "legacy-token" : null,
      },
    } as unknown as Window & typeof globalThis;
    vi.stubGlobal("document", { cookie: "" });
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "/custom-api");
    expect(resolveApiBaseUrl()).toBe("/custom-api");
  });

  it("uses CONTROLHUB_API_BASE_URL on the server when set", () => {
    // @ts-expect-error test server runtime
    delete globalThis.window;
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "http://localhost:8081");
    expect(resolveApiBaseUrl()).toBe("http://localhost:8081");
  });

  it("uses localhost backend on the server by default", () => {
    // @ts-expect-error test server runtime
    delete globalThis.window;
    vi.stubEnv("CONTROLHUB_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("http://localhost:8080");
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

  it("does not treat unauthenticated 401 as session expiry", async () => {
    const hrefOwner = { href: "http://localhost:3100/login" };
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => null,
        removeItem: vi.fn(),
      },
      location: hrefOwner,
    });
    vi.stubGlobal("document", { cookie: "" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "unauthorized" }),
    } as Response);

    await expect(apiClient("/environments")).rejects.toEqual(
      new ApiError(401, "unauthorized"),
    );
    expect(hrefOwner.href).toBe("http://localhost:3100/login");
    expect(window.sessionStorage.removeItem).not.toHaveBeenCalled();
  });

  it("clears the legacy token and redirects on credentialed 401", async () => {
    const removeItem = vi.fn();
    const hrefOwner = { href: "http://localhost:3100/overview" };
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) =>
          key === "controlhub.token" ? "legacy-token" : null,
        removeItem,
      },
      location: hrefOwner,
    });
    vi.stubGlobal("document", { cookie: "controlhub.token=legacy-token" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "unauthorized" }),
    } as Response);

    await expect(apiClient("/environments")).rejects.toEqual(
      new ApiError(401, "unauthorized"),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer legacy-token",
        }),
      }),
    );
    expect(removeItem).toHaveBeenCalledWith("controlhub.token");
    expect(document.cookie).toContain("max-age=0");
    expect(hrefOwner.href).toBe("/login?reason=session-expired");
  });

  it("sends the legacy document cookie when sessionStorage is empty", async () => {
    vi.stubGlobal("window", {
      sessionStorage: { getItem: () => null, removeItem: vi.fn() },
      location: { href: "http://localhost:3100/overview" },
    });
    vi.stubGlobal("document", { cookie: "controlhub.token=cookie-token" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    await expect(apiClient("/health")).resolves.toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer cookie-token",
        }),
      }),
    );
  });
});
