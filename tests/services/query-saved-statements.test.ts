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

  it("maps a coded 404 envelope to SavedStatementError without guessing from status", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(404, "missing", undefined, "not_found"),
    );
    await expect(listSavedStatements(22)).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 404,
      code: "not_found",
      message: "missing",
    });
  });

  it("preserves saved_statement_not_found from the envelope code", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(404, "missing", undefined, "saved_statement_not_found"),
    );
    await expect(listSavedStatements(22)).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 404,
      code: "saved_statement_not_found",
    });
  });

  it("maps 403 with forbidden from the envelope code", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "not allowed", undefined, "forbidden"),
    );
    await expect(listSavedStatements(22)).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 403,
      code: "forbidden",
    });
  });

  it("does not invent forbidden from HTTP 403 when the envelope omits a code", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(403, "not allowed"));
    const error = await listSavedStatements(22).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SavedStatementError);
    expect(error).toMatchObject({
      name: "SavedStatementError",
      status: 403,
      code: "service_unavailable",
    });
    expect((error as SavedStatementError).code).not.toBe("forbidden");
  });

  it("does not invent not_found from HTTP 404 when the envelope omits a code", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(404, "missing"));
    const error = await listSavedStatements(22).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SavedStatementError);
    expect((error as SavedStatementError).code).toBe("service_unavailable");
    expect((error as SavedStatementError).code).not.toBe("not_found");
  });

  it("treats transport failure as retryable unavailability", async () => {
    mockApiClient.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(listSavedStatements(22)).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 0,
      code: "service_unavailable",
    });
  });

  it("does not convert 401 into a SavedStatementError", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(401, "unauthorized", undefined, "unauthorized"),
    );
    const error = await listSavedStatements(22).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(SavedStatementError);
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
      parameters: [],
    });
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements",
      {
        method: "POST",
        body: JSON.stringify({ name: "test", statement: "SELECT 1", scope: "personal", parameters: [] }),
      },
    );
  });

  it("sends only allowed fields", async () => {
    mockApiClient.mockResolvedValueOnce({ id: 1 });
    await createSavedStatement(22, {
      name: "test",
      statement: "SELECT 1",
      scope: "personal",
      parameters: [],
    });
    const body = requestBody();
    expect(body).toEqual({ name: "test", statement: "SELECT 1", scope: "personal", parameters: [] });
    expect(body).not.toHaveProperty("actorUserId");
    expect(body).not.toHaveProperty("ownerUserId");
    expect(body).not.toHaveProperty("role");
    expect(body).not.toHaveProperty("credentials");
    expect(body).not.toHaveProperty("dsn");
  });

  it("includes parameter definitions in create payload", async () => {
    mockApiClient.mockResolvedValueOnce({ id: 1 });
    await createSavedStatement(22, {
      name: "template",
      statement: "SELECT * FROM orders WHERE status = :status",
      scope: "shared_template",
      parameters: [
        { name: "status", type: "string" },
        { name: "min_id", type: "integer" },
      ],
    });
    const body = requestBody();
    expect(body.parameters).toEqual([
      { name: "status", type: "string" },
      { name: "min_id", type: "integer" },
    ]);
  });

  it("strips protected and unknown fields from nested create parameters", async () => {
    mockApiClient.mockResolvedValueOnce({ id: 1 });
    await createSavedStatement(22, {
      name: "template",
      statement: "SELECT :status",
      scope: "personal",
      parameters: [{ name: "status", type: "string", value: "secret" } as never],
    });
    expect(requestBody().parameters).toEqual([{ name: "status", type: "string" }]);
  });
});

describe("updateSavedStatement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs to /query-targets/:id/saved-statements/:statementId", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, { name: "updated", statement: "SELECT 2", parameters: [] });
    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements/5",
      {
        method: "PUT",
        body: JSON.stringify({ name: "updated", statement: "SELECT 2", parameters: [] }),
      },
    );
  });

  it("never sends scope on update", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, { name: "updated", statement: "SELECT 2", parameters: [] });
    const body = requestBody();
    expect(body).not.toHaveProperty("scope");
    expect(body).not.toHaveProperty("ownerUserId");
    expect(body).not.toHaveProperty("role");
  });

  it("includes parameter definitions in update payload", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, {
      name: "template",
      statement: "SELECT * FROM t WHERE id = :id",
      parameters: [{ name: "id", type: "integer" }],
    });
    const body = requestBody();
    expect(body.parameters).toEqual([{ name: "id", type: "integer" }]);
  });

  it("strips protected and unknown fields from nested update parameters", async () => {
    mockApiClient.mockResolvedValueOnce(undefined);
    await updateSavedStatement(22, 5, {
      name: "template",
      statement: "SELECT :id",
      parameters: [{ name: "id", type: "integer", value: "42" } as never],
    });
    expect(requestBody().parameters).toEqual([{ name: "id", type: "integer" }]);
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

describe("createSavedStatement error mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps validation_failed from the envelope code", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(400, "bad input", undefined, "validation_failed"),
    );
    await expect(
      createSavedStatement(22, {
        name: "test",
        statement: "SELECT 1",
        scope: "personal",
        parameters: [],
      }),
    ).rejects.toMatchObject({
      name: "SavedStatementError",
      status: 400,
      code: "validation_failed",
    });
  });
});

describe("deleteSavedStatement error mapping", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps forbidden from the envelope code, not HTTP 403", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "not allowed", undefined, "forbidden"),
    );
    await expect(deleteSavedStatement(22, 5)).rejects.toMatchObject({
      name: "SavedStatementError",
      code: "forbidden",
      status: 403,
    });
  });

  it("does not invent forbidden from HTTP 403 when the code is absent", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(403, "not allowed"));
    const error = await deleteSavedStatement(22, 5).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(SavedStatementError);
    expect((error as SavedStatementError).code).toBe("service_unavailable");
    expect((error as SavedStatementError).code).not.toBe("forbidden");
  });
});
