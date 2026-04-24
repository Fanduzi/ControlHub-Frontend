import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient, ApiError } from "@/services/api-client";

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
