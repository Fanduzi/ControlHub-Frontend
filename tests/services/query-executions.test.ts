import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/services/api-client", async () => {
  const actual = await vi.importActual("@/services/api-client");
  return {
    ...actual,
    apiClient: vi.fn(),
  };
});

import { ApiError } from "@/services/api-client";
import { apiClient } from "@/services/api-client";
import {
  executeQueryTarget,
  listQueryExecutions,
  QueryExecuteError,
} from "@/services/query-executions";
import * as queryExecutionsModule from "@/services/query-executions";

const mockApiClient = vi.mocked(apiClient);

function buildExecuteResponse() {
  return {
    executionId: 1001,
    status: "success" as const,
    targetResourceId: 22,
    engine: "mysql",
    columns: [{ name: "value", databaseType: "BIGINT", nullable: false }],
    rows: [[1]],
    rowCount: 1,
    truncated: false,
    durationMs: 18,
    limitApplied: 100,
    executedAt: "2026-06-22T08:30:00Z",
  };
}

function buildExecutionListResponse() {
  return {
    items: [
      {
        id: 1001,
        targetResourceId: 22,
        actorUserId: 1,
        engine: "mysql",
        statementDigest: "select 1 as value",
        statementPreview: "select 1 as value",
        status: "success" as const,
        rowCount: 1,
        durationMs: 18,
        errorCode: "",
        errorMessage: "",
        createdAt: "2026-06-22T08:30:00Z",
      },
    ],
    pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
}

/** Read the JSON body our service passed to apiClient as an object. */
function requestBody(init: unknown): Record<string, unknown> {
  const body = (init as { body?: string } | undefined)?.body;
  return body ? (JSON.parse(body) as Record<string, unknown>) : {};
}

describe("executeQueryTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to /query-targets/:id/execute", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, { statement: "select 1", maxRows: 100 });

    expect(mockApiClient).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiClient.mock.calls[0]!;
    expect(path).toBe("/query-targets/22/execute");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("sends a body containing only statement and maxRows", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, { statement: "select 1", maxRows: 100 });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).toEqual({ statement: "select 1", maxRows: 100 });
  });

  it("never sends actorUserId in the request body", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, { statement: "select 1", maxRows: 100 });

    const [, init] = mockApiClient.mock.calls[0]!;
    const body = JSON.stringify(requestBody(init));
    expect(body).not.toContain("actorUserId");
    expect(body).not.toContain("actor_user_id");
  });

  it("omits maxRows from the body when not provided", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, { statement: "select 1" });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).toEqual({ statement: "select 1" });
  });

  it("returns the backend execution response unchanged", async () => {
    const response = buildExecuteResponse();
    mockApiClient.mockResolvedValueOnce(response);

    await expect(
      executeQueryTarget(22, { statement: "select 1", maxRows: 100 }),
    ).resolves.toEqual(response);
  });

  it("surfaces a controlled error with mapped code and no raw Response leakage", async () => {
    // The shared apiClient throws ApiError(status, message). The execute service
    // must convert that into a controlled QueryExecuteError carrying a stable
    // machine code, while never exposing the raw fetch Response or stack.
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "target is not enabled for execution"),
    );

    await expect(
      executeQueryTarget(22, { statement: "select 1", maxRows: 100 }),
    ).rejects.toMatchObject({
      name: "QueryExecuteError",
      status: 403,
      code: "query_not_allowed",
      message: "target is not enabled for execution",
    });
  });

  it("maps each documented status to its controlled error code", async () => {
    const cases: Array<[number, string]> = [
      [400, "validation_failed"],
      [403, "query_not_allowed"],
      [404, "query_target_not_found"],
      [408, "query_timeout"],
      [500, "internal_error"],
      [502, "query_backend_error"],
    ];

    for (const [status, code] of cases) {
      mockApiClient.mockRejectedValueOnce(new ApiError(status, "blocked"));
      const error = await executeQueryTarget(22, {
        statement: "select 1",
        maxRows: 100,
      }).catch((value: unknown) => value as QueryExecuteError);
      expect(error).toBeInstanceOf(QueryExecuteError);
      expect((error as QueryExecuteError).code).toBe(code);
      expect((error as QueryExecuteError).status).toBe(status);
    }
  });
});

describe("listQueryExecutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GETs /query-targets/:id/executions with default page and pageSize", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecutionListResponse());

    await listQueryExecutions(22);

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/executions?page=1&pageSize=20",
    );
  });

  it("forwards custom page and pageSize", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecutionListResponse());

    await listQueryExecutions(22, { page: 2, pageSize: 5 });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/executions?page=2&pageSize=5",
    );
  });

  it("never includes actorUserId in the query string", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecutionListResponse());

    await listQueryExecutions(22);

    const [path] = mockApiClient.mock.calls[0]!;
    expect(path).not.toContain("actorUserId");
    expect(path).not.toContain("actor_user_id");
  });

  it("returns the backend history envelope unchanged", async () => {
    const response = buildExecutionListResponse();
    mockApiClient.mockResolvedValueOnce(response);

    await expect(listQueryExecutions(22)).resolves.toEqual(response);
  });
});

describe("query-executions module surface", () => {
  it("exposes only the execute and history functions plus the error class", () => {
    // Guards against accidentally widening this module (e.g. adding an auth or
    // credential helper). The query execution path must stay narrowly scoped.
    expect(Object.keys(queryExecutionsModule).sort()).toEqual(
      ["QueryExecuteError", "executeQueryTarget", "listQueryExecutions"].sort(),
    );
  });
});
