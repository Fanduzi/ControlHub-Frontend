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

  it("uses /__api in the browser by default", () => {
    globalThis.window = {} as Window & typeof globalThis;
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(resolveApiBaseUrl()).toBe("/__api");
  });

  it("uses NEXT_PUBLIC_API_BASE_URL in the browser when explicitly set", () => {
    globalThis.window = {} as Window & typeof globalThis;
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
});
