import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return { ...actual, apiClient: vi.fn() };
});

import { ApiError, apiClient } from "@/services/api-client";
import {
  SavedStatementError,
  createSavedStatement,
  deleteSavedStatement,
  listSavedStatements,
  updateSavedStatement,
} from "@/services/query-saved-statements";

const mockApiClient = vi.mocked(apiClient);

function requestBody(): Record<string, unknown> {
  const body = mockApiClient.mock.calls[0]?.[1]?.body;
  return JSON.parse(String(body)) as Record<string, unknown>;
}

describe("listSavedStatements", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs /query-targets/:id/saved-statements", async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [],
      pageInfo: {},
      canManageSharedTemplates: false,
    });
    await listSavedStatements(22);
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements?",
      expect.objectContaining({ signal: undefined }),
    );
  });

  it("includes search params", async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [],
      pageInfo: {},
      canManageSharedTemplates: false,
    });
    await listSavedStatements(22, { q: "orders", page: 2, pageSize: 10 });
    expect(mockApiClient).toHaveBeenCalledWith(
      expect.stringContaining("q=orders"),
      expect.anything(),
    );
  });

  it("forwards AbortSignal", async () => {
    mockApiClient.mockResolvedValueOnce({
      items: [],
      pageInfo: {},
      canManageSharedTemplates: false,
    });
    const controller = new AbortController();
    await listSavedStatements(22, { signal: controller.signal });
    expect(mockApiClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("maps ApiError to SavedStatementError", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(404, "missing"));
    await expect(listSavedStatements(22)).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 404,
      code: "not_found",
      message: "missing",
    });
  });
});

describe("createSavedStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs to /query-targets/:id/saved-statements", async () => {
    mockApiClient.mockResolvedValueOnce({ id: 1, name: "test" });
    await createSavedStatement(22, {
      name: "test",
      statement: "SELECT 1",
      scope: "personal",
    });
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements",
      {
        method: "POST",
        body: JSON.stringify({ name: "test", statement: "SELECT 1", scope: "personal" }),
      },
    );
  });

  it("sends only allowed fields", async () => {
    mockApiClient.mockResolvedValueOnce({ id: 1 });
    await createSavedStatement(22, {
      name: "test",
      statement: "SELECT 1",
      scope: "personal",
    });
    const body = requestBody();
    expect(body).toEqual({ name: "test", statement: "SELECT 1", scope: "personal" });
    expect(body).not.toHaveProperty("actorUserId");
    expect(body).not.toHaveProperty("ownerUserId");
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("credentials");
    expect(body).not.toHaveProperty("dsn");
  });
});

describe("updateSavedStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs to /query-targets/:id/saved-statements/:statementId", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, { name: "updated", statement: "SELECT 2" });
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements/5",
      {
        method: "PUT",
        body: JSON.stringify({ name: "updated", statement: "SELECT 2" }),
      },
    );
  });

  it("never sends scope on update", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, { name: "updated", statement: "SELECT 2" });
    const body = requestBody();
    expect(body).not.toHaveProperty("scope");
    expect(body).not.toHaveProperty("ownerUserId");
    expect(body).not.toHaveProperty("role");
  });
});

describe("deleteSavedStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("DELETEs /query-targets/:id/saved-statements/:statementId", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await deleteSavedStatement(22, 5);
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements/5",
      { method: "DELETE" },
    );
  });
});

describe("SavedStatementError", () => {
  it("maps 400 to validation_failed", () => {
    const error = new SavedStatementError(400, "validation_failed", "bad input");
    expect(error.code).toBe("validation_failed");
    expect(error.status).toBe(400);
  });

  it("maps 403 to forbidden", () => {
    const error = new SavedStatementError(403, "forbidden", "not allowed");
    expect(error.code).toBe("forbidden");
  });

  it("maps 404 to not_found", () => {
    const error = new SavedStatementError(404, "not_found", "missing");
    expect(error.code).toBe("not_found");
  });
});
