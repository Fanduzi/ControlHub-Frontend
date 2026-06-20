import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { apiClient } from "@/services/api-client";
import { getQueryTargets } from "@/services/query-targets";
import * as queryTargetsModule from "@/services/query-targets";
import { buildQueryTarget, buildQueryTargetList } from "@/tests/fixtures/query-targets";

const mockApiClient = vi.mocked(apiClient);

describe("getQueryTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls GET /query-targets with no query string by default", async () => {
    mockApiClient.mockResolvedValueOnce(buildQueryTargetList());

    await getQueryTargets();

    expect(mockApiClient).toHaveBeenCalledWith("/query-targets");
  });

  it("appends engine and environmentId filters when provided", async () => {
    mockApiClient.mockResolvedValueOnce(buildQueryTargetList());

    await getQueryTargets({ engine: "mysql", environmentId: 7 });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets?engine=mysql&environmentId=7",
    );
  });

  it("returns the { items } envelope from the backend unchanged", async () => {
    const response = buildQueryTargetList([
      buildQueryTarget({ resourceId: 1 }),
      buildQueryTarget({ resourceId: 2 }),
    ]);
    mockApiClient.mockResolvedValueOnce(response);

    await expect(getQueryTargets()).resolves.toEqual(response);
  });

  it("never exposes a query execution method", () => {
    // The query-targets service must be read-only. This guards against a
    // future regression that adds an execution path in the wrong module.
    expect(typeof getQueryTargets).toBe("function");
    expect(Object.keys(queryTargetsModule)).toEqual(["getQueryTargets"]);
  });
});
