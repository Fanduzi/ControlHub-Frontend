// input: Vitest, named inventory view service functions, and mocked API client
// output: named inventory view request-shape and controlled-error regression tests
// pos: service contract tests for saved inventory view API boundary
// note: if this file changes, update this header and tests/services/README.md
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return { ...actual, apiClient: vi.fn() };
});

import { ApiError, apiClient } from "@/services/api-client";
import {
  createNamedInventoryView,
  deleteNamedInventoryView,
  listNamedInventoryViews,
  updateNamedInventoryView,
} from "@/services/named-inventory-views";
import type {
  CreateNamedInventoryViewInput,
  NamedInventoryView,
  NamedInventoryViewListResponse,
} from "@/types/named-inventory-view";

const apiClientMock = vi.mocked(apiClient);

const state = {
  filters: {
    q: "orders + primary",
    environmentId: "001",
    includeArchived: "false",
  },
  sort: { field: "displayName", direction: "asc" as const },
  columns: ["displayName", "ownerId"],
};

const view: NamedInventoryView = {
  id: 7,
  name: "Orders",
  scope: "personal",
  state,
  createdAt: "2026-08-30T00:00:00Z",
  updatedAt: "2026-08-30T00:00:00Z",
};

describe("named inventory views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs the list and preserves server-managed sharing metadata", async () => {
    const response: NamedInventoryViewListResponse = {
      items: [view],
      canManageShared: false,
    };
    apiClientMock.mockResolvedValueOnce(response);

    await expect(listNamedInventoryViews()).resolves.toEqual(response);
    expect(apiClientMock).toHaveBeenCalledWith("/inventory/views");
  });

  it("POSTs the opaque view state unchanged", async () => {
    const input: CreateNamedInventoryViewInput = {
      name: "Orders",
      scope: "personal",
      state,
    };
    apiClientMock.mockResolvedValueOnce(view);

    await createNamedInventoryView(input);

    expect(apiClientMock).toHaveBeenCalledWith("/inventory/views", {
      method: "POST",
      body: JSON.stringify(input),
    });
  });

  it("PUTs the opaque view state unchanged", async () => {
    const input: CreateNamedInventoryViewInput = {
      name: "Shared orders",
      scope: "shared",
      state: {
        ...state,
        filters: { ...state.filters, ownerId: "0007" },
      },
    };
    apiClientMock.mockResolvedValueOnce({ ...view, ...input });

    await updateNamedInventoryView(7, input);

    expect(apiClientMock).toHaveBeenCalledWith("/inventory/views/7", {
      method: "PUT",
      body: JSON.stringify(input),
    });
  });

  it("DELETEs the view by id", async () => {
    apiClientMock.mockResolvedValueOnce(undefined);

    await deleteNamedInventoryView(7);

    expect(apiClientMock).toHaveBeenCalledWith("/inventory/views/7", {
      method: "DELETE",
    });
  });

  it("propagates controlled API errors unchanged", async () => {
    const error = new ApiError(403, "not allowed", undefined, "forbidden");
    apiClientMock.mockRejectedValueOnce(error);

    await expect(
      createNamedInventoryView({ name: "Shared", scope: "shared", state }),
    ).rejects.toBe(error);
  });
});
