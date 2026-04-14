import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  listHealthStatuses,
  listLifecycleStatuses,
} from "@/services/settings";
import type { DictionaryItemListResponse } from "@/types/settings";

const { apiClientMock } = vi.hoisted(() => ({
  apiClientMock: vi.fn(),
}));

vi.mock("@/services/api-client", () => ({
  apiClient: apiClientMock,
}));

describe("listLifecycleStatuses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches lifecycle statuses from GET /lifecycle-statuses", async () => {
    const response: DictionaryItemListResponse = {
      items: [
        { key: "provisioning", label: "Provisioning", description: "Resource is being provisioned" },
        { key: "running", label: "Running", description: "Resource is operational" },
        { key: "stopped", label: "Stopped", description: "Resource has been stopped" },
        { key: "retired", label: "Retired", description: "Resource is retired" },
        { key: "pending", label: "Pending", description: "Resource is pending" },
      ],
    };

    apiClientMock.mockResolvedValue(response);

    const result = await listLifecycleStatuses();

    expect(apiClientMock).toHaveBeenCalledWith("/lifecycle-statuses");
    expect(result).toHaveLength(5);
    expect(result[0].key).toBe("provisioning");
    expect(result[0].label).toBe("Provisioning");
  });

  it("returns empty array when backend is unavailable", async () => {
    apiClientMock.mockRejectedValue(new Error("Request failed: 502"));

    const result = await listLifecycleStatuses();

    expect(result).toEqual([]);
  });
});

describe("listHealthStatuses", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches health statuses from GET /health-statuses", async () => {
    const response: DictionaryItemListResponse = {
      items: [
        { key: "healthy", label: "Healthy", description: "Resource is healthy" },
        { key: "warning", label: "Warning", description: "Resource has warnings" },
        { key: "degraded", label: "Degraded", description: "Resource is degraded" },
        { key: "critical", label: "Critical", description: "Resource is critical" },
      ],
    };

    apiClientMock.mockResolvedValue(response);

    const result = await listHealthStatuses();

    expect(apiClientMock).toHaveBeenCalledWith("/health-statuses");
    expect(result).toHaveLength(4);
    expect(result[0].key).toBe("healthy");
  });

  it("returns empty array when backend is unavailable", async () => {
    apiClientMock.mockRejectedValue(new Error("Request failed: 502"));

    const result = await listHealthStatuses();

    expect(result).toEqual([]);
  });
});
