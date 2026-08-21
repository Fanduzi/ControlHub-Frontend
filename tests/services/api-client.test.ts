// input: vitest, api-client
// output: tests for resolveApiBaseUrl, unsafe integers, browser BFF path, BFF 401 session handling, Controlled Error Code ingest
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

  it("surfaces API errors with parsed message, details, and Controlled Error Code", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: "validation_failed",
        message: "Bad request",
        details: { id: "invalid" },
      }),
    } as Response);

    const failure = await apiClient("/resources/1").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 400,
      message: "Bad request",
      details: { id: "invalid" },
      code: "validation_failed",
    });
  });

  it("preserves JSON error as ApiError.code without rebuilding it from status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: "query_result_disclosure_blocked",
        message: "blocked by result disclosure policy",
      }),
    } as Response);

    const failure = await apiClient("/query/executions").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 403,
      message: "blocked by result disclosure policy",
      code: "query_result_disclosure_blocked",
    });
  });

  it("does not invent a business code from HTTP status when JSON omits error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        message: "blocked",
      }),
    } as Response);

    const failure = await apiClient("/query/executions").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    const apiError = failure as ApiError;
    expect(apiError).toMatchObject({
      status: 403,
      message: "blocked",
    });
    expect(apiError.code).toBeUndefined();
    expect(apiError).not.toMatchObject({ code: "query_not_allowed" });
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

  it("ignores stale legacy bearer storage: still routes through the BFF proxy without Authorization", async () => {
    // A pre-BFF upgrade can leave controlhub.token behind in browser
    // storage. The client must never resurrect the direct-bearer path —
    // the same-origin BFF proxy stays the only request boundary.
    const getItem = vi.fn((key: string) =>
      key === "controlhub.token" ? "legacy-bearer-value" : null,
    );
    vi.stubGlobal("window", {
      sessionStorage: { getItem, removeItem: vi.fn() },
      location: { href: "http://localhost:3100/overview" },
    });
    vi.stubGlobal("document", { cookie: "controlhub.token=legacy-bearer-value" });

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
    expect(fetchSpy.mock.calls[0]?.[0]).not.toContain("8080");
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
      json: async () => ({ error: "unauthorized", message: "unauthorized" }),
    } as Response);

    const failure = await apiClient("/environments").catch((error) => error);
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({
      status: 401,
      message: "unauthorized",
      code: "unauthorized",
    });
    expect(hrefOwner.href).toBe("/login?reason=session-expired");
    expect(removeItem).toHaveBeenCalledWith("controlhub.role");
  });
});
