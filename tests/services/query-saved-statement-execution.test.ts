import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return { ...actual, apiClient: vi.fn() };
});

import { ApiError, apiClient } from "@/services/api-client";
import { executeSavedStatementTemplate } from "@/services/query-saved-statements";
import type { QueryExecuteResponse } from "@/types/query-execution";

const mockApiClient = vi.mocked(apiClient);

function buildResponse(): QueryExecuteResponse {
  return {
    executionId: 1,
    status: "success",
    targetResourceId: 22,
    engine: "mysql",
    columns: [{ name: "id", databaseType: "BIGINT", nullable: false, displayMode: "raw_copy_allowed", copyAllowed: true }],
    rows: [[1]],
    rowCount: 1,
    truncated: false,
    durationMs: 5,
    limitApplied: 100,
    executedAt: "2026-08-01T00:00:00Z",
  };
}

describe("executeSavedStatementTemplate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs values only to the saved-statement execute route", async () => {
    mockApiClient.mockResolvedValueOnce(buildResponse());
    await executeSavedStatementTemplate(22, 7, {
      values: { status: "paid", minimum_total: "100.50" },
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/saved-statements/7/execute",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(String(mockApiClient.mock.calls[0]?.[1]?.body));
    expect(body).toEqual({
      values: { status: "paid", minimum_total: "100.50" },
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });
  });

  it("never sends SQL, declarations, identities, roles, or credentials", async () => {
    mockApiClient.mockResolvedValueOnce(buildResponse());
    await executeSavedStatementTemplate(22, 7, {
      values: { status: "paid" },
    });
    const body = JSON.stringify(JSON.parse(String(mockApiClient.mock.calls[0]?.[1]?.body)));
    for (const forbidden of ["statement", "parameters", "actorUserId", "ownerUserId", "role", "credential", "dsn", "password"]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("omits maxRows and pagination when not supplied", async () => {
    mockApiClient.mockResolvedValueOnce(buildResponse());
    await executeSavedStatementTemplate(22, 7, { values: { status: "paid" } });
    const body = JSON.parse(String(mockApiClient.mock.calls[0]?.[1]?.body));
    expect(body.maxRows).toBeUndefined();
    expect(body.pagination).toBeUndefined();
  });

  it("maps validation errors to QueryExecuteError carrying field details", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(400, "template parameter validation failed", {
        status: "missing",
        bogus: "unknown",
      }, "validation_failed"),
    );
    await expect(executeSavedStatementTemplate(22, 7, { values: {} })).rejects.toMatchObject({
      name: "QueryExecuteError",
      status: 400,
      code: "validation_failed",
      details: { status: "missing", bogus: "unknown" },
    });
  });

  it("maps saved_statement_not_found from the envelope code", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(404, "saved statement not found", undefined, "saved_statement_not_found"),
    );
    await expect(executeSavedStatementTemplate(22, 7, { values: {} })).rejects.toMatchObject({
      code: "saved_statement_not_found",
      status: 404,
    });
  });

  it("maps query_target_not_found from the envelope code", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(404, "target missing", undefined, "query_target_not_found"),
    );
    await expect(executeSavedStatementTemplate(22, 7, { values: {} })).rejects.toMatchObject({
      code: "query_target_not_found",
      status: 404,
    });
  });

  it("does not invent query_target_not_found from HTTP 404 when the code is absent", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(404, "saved statement not found"));
    const error = await executeSavedStatementTemplate(22, 7, { values: {} }).catch(
      (value: unknown) => value,
    );
    expect(error).toMatchObject({
      name: "QueryExecuteError",
      status: 404,
      code: "service_unavailable",
    });
  });

  it("classifies disclosure blocked and query_not_allowed by code on the same HTTP 403", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "blocked", undefined, "query_result_disclosure_blocked"),
    );
    await expect(executeSavedStatementTemplate(22, 7, { values: {} })).rejects.toMatchObject({
      code: "query_result_disclosure_blocked",
      status: 403,
    });

    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "query_result_disclosure_blocked: leftover", undefined, "query_not_allowed"),
    );
    await expect(executeSavedStatementTemplate(22, 7, { values: {} })).rejects.toMatchObject({
      code: "query_not_allowed",
      status: 403,
    });
  });

  it("never echoes supplied values in error messages", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(400, "template parameter validation failed", { status: "invalid" }),
    );
    try {
      await executeSavedStatementTemplate(22, 7, { values: { status: "SECRET-VALUE" } });
      throw new Error("expected rejection");
    } catch (error) {
      expect(String((error as Error).message)).not.toContain("SECRET-VALUE");
    }
  });
});
