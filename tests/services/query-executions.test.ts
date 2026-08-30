// input: Vitest, mocked API client, query execution service
// output: service contract tests for governed execution, fail-closed history restore eligibility, and statement recovery
// pos: service-level regression tests for query target transport operations
// note: if this file changes, update this header and tests/services/README.md.
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
  explainQueryTarget,
  isRetryableControlledErrorCode,
  listQueryExecutions,
  getQueryExecutionStatement,
  navigateRelatedRecords,
  QueryExecuteError,
} from "@/services/query-executions";
import * as queryExecutionsModule from "@/services/query-executions";

const mockApiClient = vi.mocked(apiClient);

function col(
  name: string,
  databaseType: string,
  nullable: boolean,
): { name: string; databaseType: string; nullable: boolean; displayMode: "raw_copy_allowed"; copyAllowed: true } {
  return { name, databaseType, nullable, displayMode: "raw_copy_allowed", copyAllowed: true };
}

function buildExecuteResponse() {
  return {
    executionId: 1001,
    status: "success" as const,
    targetResourceId: 22,
    engine: "mysql",
    columns: [col("value", "BIGINT", false)],
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
        actor: { displayName: "Chen Hao" },
        engine: "mysql",
        statementDigest: "select 1 as value",
        statementPreview: "select 1 as value",
        canRestore: true,
        status: "success" as const,
        rowCount: 1,
        durationMs: 18,
        errorCode: "",
        errorMessage: "",
        createdAt: "2026-06-22T08:30:00Z",
      },
    ],
    nextCursor: null,
    pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
  };
}

function buildRelatedRecordResponse() {
  return {
    executionId: 2001,
    status: "success" as const,
    targetResourceId: 22,
    engine: "mysql",
    columns: [
      col("id", "BIGINT", false),
      col("name", "VARCHAR", true),
    ],
    rows: [[100, "Widget"]],
    rowCount: 1,
    truncated: false,
    durationMs: 12,
    limitApplied: 100,
    executedAt: "2026-07-14T08:00:00Z",
    sourceDatabase: "orders",
    sourceObject: "order_items",
    foreignKey: "fk_order_items_order",
    referencedDatabase: "orders",
    referencedObject: "orders",
    referencedColumns: ["id"],
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

  it("surfaces a controlled error with the envelope code and no raw Response leakage", async () => {
    // The shared apiClient throws ApiError with Controlled Error Code. Execute
    // must copy that code onto QueryExecuteError and never expose a fetch Response.
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "target is not enabled for execution", undefined, "query_not_allowed"),
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

  it("classifies execute failures by Controlled Error Code, not HTTP status", async () => {
    const cases: Array<[number, string]> = [
      [400, "validation_failed"],
      [403, "query_not_allowed"],
      [403, "query_result_disclosure_blocked"],
      [404, "query_target_not_found"],
      [408, "query_timeout"],
      [500, "internal_error"],
      [502, "query_backend_error"],
      [503, "service_unavailable"],
      // Same status as a policy refusal; the code is the identity.
      [403, "query_timeout"],
    ];

    for (const [status, code] of cases) {
      mockApiClient.mockRejectedValueOnce(new ApiError(status, "blocked", undefined, code));
      const error = await executeQueryTarget(22, {
        statement: "select 1",
        maxRows: 100,
      }).catch((value: unknown) => value as QueryExecuteError);
      expect(error).toBeInstanceOf(QueryExecuteError);
      expect((error as QueryExecuteError).code).toBe(code);
      expect((error as QueryExecuteError).status).toBe(status);
    }
  });

  it("maps 403 with query_result_disclosure_blocked from ApiError.code, not message text", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "column masked", undefined, "query_result_disclosure_blocked"),
    );

    const error = await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
    }).catch((value: unknown) => value as QueryExecuteError);
    expect(error).toBeInstanceOf(QueryExecuteError);
    expect((error as QueryExecuteError).code).toBe(
      "query_result_disclosure_blocked",
    );
    expect((error as QueryExecuteError).status).toBe(403);
  });

  it("does not sniff disclosure_blocked out of message when the code is query_not_allowed", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(
        403,
        "query_result_disclosure_blocked: column masked",
        undefined,
        "query_not_allowed",
      ),
    );

    const error = await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
    }).catch((value: unknown) => value as QueryExecuteError);
    expect(error).toBeInstanceOf(QueryExecuteError);
    expect((error as QueryExecuteError).code).toBe("query_not_allowed");
  });

  it("treats a JSON error missing a Controlled Error Code as retryable unavailability", async () => {
    mockApiClient.mockRejectedValueOnce(new ApiError(403, "blocked"));

    const error = await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
    }).catch((value: unknown) => value as QueryExecuteError);
    expect(error).toBeInstanceOf(QueryExecuteError);
    expect((error as QueryExecuteError).code).toBe("service_unavailable");
    expect((error as QueryExecuteError).code).not.toBe("query_not_allowed");
    expect((error as QueryExecuteError).status).toBe(403);
  });

  it("treats transport failure as retryable unavailability", async () => {
    mockApiClient.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const error = await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
    }).catch((value: unknown) => value as QueryExecuteError);
    expect(error).toBeInstanceOf(QueryExecuteError);
    expect((error as QueryExecuteError).code).toBe("service_unavailable");
    expect((error as QueryExecuteError).status).toBe(0);
  });

  it("does not convert 401 into a feature QueryExecuteError", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(401, "unauthorized", undefined, "unauthorized"),
    );

    const error = await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
    }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(QueryExecuteError);
  });
});

describe("listQueryExecutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GETs /query-targets/:id/executions with default pageSize", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecutionListResponse());

    await listQueryExecutions(22);

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/executions?pageSize=20",
    );
  });

  it("forwards custom pageSize and filters", async () => {
    mockApiClient.mockResolvedValueOnce(buildExecutionListResponse());

    await listQueryExecutions(22, { pageSize: 5, status: "failed" });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/executions?status=failed&pageSize=5",
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

  it("trusts only the server restore flag and fails legacy rows closed", async () => {
    const ownSuccess = buildExecutionListResponse().items[0]!;
    mockApiClient.mockResolvedValueOnce({
      items: [
        ownSuccess,
        { ...ownSuccess, id: 1002, actor: { kind: "user", displayName: "Other user" }, canRestore: false },
        { ...ownSuccess, id: 1003, actor: { kind: "machine", displayName: "CI bot" }, canRestore: false },
        { ...ownSuccess, id: 1004, status: "failed", canRestore: false },
        { ...ownSuccess, id: 1005, statementPreview: "select legacy", canRestore: undefined },
      ],
      nextCursor: null,
    });

    const response = await listQueryExecutions(22);

    expect(response.items.map((item) => item.canRestore)).toEqual([
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe("getQueryExecutionStatement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GETs the owner-only execution statement without sending actor identity", async () => {
    mockApiClient.mockResolvedValueOnce({ statement: "select * from orders" });

    await expect(getQueryExecutionStatement(22, 1001)).resolves.toEqual({
      statement: "select * from orders",
    });

    expect(mockApiClient).toHaveBeenCalledWith(
      "/query-targets/22/executions/1001/statement",
    );
  });
});

describe("navigateRelatedRecords", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POSTs to /query-targets/:id/related-records", async () => {
    mockApiClient.mockResolvedValueOnce(buildRelatedRecordResponse());

    await navigateRelatedRecords(22, {
      source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
      localValues: ["42"],
    });

    expect(mockApiClient).toHaveBeenCalledTimes(1);
    const [path, init] = mockApiClient.mock.calls[0]!;
    expect(path).toBe("/query-targets/22/related-records");
    expect((init as RequestInit).method).toBe("POST");
  });

  it("sends exact body with source, localValues, and optional maxRows", async () => {
    mockApiClient.mockResolvedValueOnce(buildRelatedRecordResponse());

    await navigateRelatedRecords(22, {
      source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
      localValues: ["42"],
      maxRows: 100,
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).toEqual({
      source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
      localValues: ["42"],
      maxRows: 100,
    });
  });

  it("preserves ordered localValues in FK column order", async () => {
    mockApiClient.mockResolvedValueOnce(buildRelatedRecordResponse());

    await navigateRelatedRecords(22, {
      source: { database: "app", object: "junction", kind: "table", foreignKey: "fk_composite" },
      localValues: ["10", "20"],
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).toMatchObject({
      localValues: ["10", "20"],
    });
  });

  it("omits maxRows when not provided", async () => {
    mockApiClient.mockResolvedValueOnce(buildRelatedRecordResponse());

    await navigateRelatedRecords(22, {
      source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
      localValues: ["42"],
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).not.toHaveProperty("maxRows");
  });

  it("never sends actorUserId or SQL in the request body", async () => {
    mockApiClient.mockResolvedValueOnce(buildRelatedRecordResponse());

    await navigateRelatedRecords(22, {
      source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
      localValues: ["42"],
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    const body = JSON.stringify(requestBody(init));
    expect(body).not.toContain("actorUserId");
    expect(body).not.toContain("actor_user_id");
    expect(body).not.toContain("statement");
    expect(body).not.toContain("SELECT");
  });

  it("returns the backend related-record response unchanged", async () => {
    const response = buildRelatedRecordResponse();
    mockApiClient.mockResolvedValueOnce(response);

    await expect(
      navigateRelatedRecords(22, {
        source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
        localValues: ["42"],
      }),
    ).resolves.toEqual(response);
  });

  it("classifies related-record failures by Controlled Error Code, not HTTP status", async () => {
    const cases: Array<[number, string]> = [
      [400, "validation_failed"],
      [403, "query_not_allowed"],
      [403, "query_result_disclosure_blocked"],
      [404, "query_target_not_found"],
      [408, "query_timeout"],
      [500, "internal_error"],
      [502, "query_backend_error"],
    ];

    for (const [status, code] of cases) {
      mockApiClient.mockRejectedValueOnce(new ApiError(status, "blocked", undefined, code));
      const error = await navigateRelatedRecords(22, {
        source: { database: "orders", object: "order_items", kind: "table", foreignKey: "fk_order_items_order" },
        localValues: ["42"],
      }).catch((value: unknown) => value as QueryExecuteError);
      expect(error).toBeInstanceOf(QueryExecuteError);
      expect((error as QueryExecuteError).code).toBe(code);
      expect((error as QueryExecuteError).status).toBe(status);
    }
  });
});

describe("explainQueryTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts only the statement to the governed explain endpoint", async () => {
    const response = {
      targetResourceId: 22,
      engine: "mysql" as const,
      formatVersion: 1,
      nodes: [
        {
          id: "0",
          operation: "table_access" as const,
          access: "full_scan" as const,
          estimatedRows: 120000,
          usesIndex: false,
        },
      ],
      risks: [
        { code: "full_table_scan" as const, severity: "warning" as const },
      ],
      truncated: false,
    };
    mockApiClient.mockResolvedValueOnce(response);

    const result = await explainQueryTarget(22, { statement: "select * from big" });

    expect(result).toEqual(response);
    expect(mockApiClient).toHaveBeenCalledWith("/query-targets/22/explain", {
      method: "POST",
      body: JSON.stringify({ statement: "select * from big" }),
    });
  });

  it("never sends actor, credential, EXPLAIN prefix, or maxRows fields", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 22,
      engine: "mysql",
      formatVersion: 1,
      nodes: [],
      risks: [],
      truncated: false,
    });

    await explainQueryTarget(22, { statement: "select 1" });

    const init = mockApiClient.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toEqual({ statement: "select 1" });
    expect(body).not.toHaveProperty("actorUserId");
    expect(body).not.toHaveProperty("actor_user_id");
    expect(body).not.toHaveProperty("maxRows");
    expect(body).not.toHaveProperty("credential");
    expect(body).not.toHaveProperty("dsn");
    expect(body).not.toHaveProperty("engine");
    expect(String(body.statement)).not.toMatch(/^\s*explain/i);
  });

  it("passes AbortSignal through to apiClient", async () => {
    mockApiClient.mockResolvedValueOnce({
      targetResourceId: 22,
      engine: "mysql",
      formatVersion: 1,
      nodes: [],
      risks: [],
      truncated: false,
    });
    const controller = new AbortController();

    await explainQueryTarget(22, { statement: "select 1" }, { signal: controller.signal });

    const init = mockApiClient.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("classifies explain failures by Controlled Error Code, including 409 unsupported", async () => {
    const cases: Array<[number, string]> = [
      [400, "validation_failed"],
      [403, "query_not_allowed"],
      [404, "query_target_not_found"],
      [408, "query_timeout"],
      [409, "query_explain_not_supported"],
      [500, "internal_error"],
      [502, "query_backend_error"],
    ];

    for (const [status, code] of cases) {
      mockApiClient.mockRejectedValueOnce(new ApiError(status, "blocked", undefined, code));
      const error = await explainQueryTarget(22, { statement: "select 1" }).catch(
        (value: unknown) => value as QueryExecuteError,
      );
      expect(error).toBeInstanceOf(QueryExecuteError);
      expect((error as QueryExecuteError).code).toBe(code);
      expect((error as QueryExecuteError).status).toBe(status);
    }
  });
});

describe("query-executions module surface", () => {
  it("exposes only the execute, history, explain, and related-record functions plus the error class", () => {
    // Guards against accidentally widening this module (e.g. adding an auth or
    // credential helper). The query execution path must stay narrowly scoped.
    expect(Object.keys(queryExecutionsModule).sort()).toEqual(
      [
        "QueryExecuteError",
        "executeQueryTarget",
        "explainQueryTarget",
        "getQueryExecutionStatement",
        "isRetryableControlledErrorCode",
        "listQueryExecutions",
        "navigateRelatedRecords",
        "toQueryExecuteError",
      ].sort(),
    );
  });
});

describe("isRetryableControlledErrorCode", () => {
  it("treats retry as a property of the Controlled Error Code, not HTTP status", () => {
    expect(isRetryableControlledErrorCode("internal_error")).toBe(true);
    expect(isRetryableControlledErrorCode("query_backend_error")).toBe(true);
    expect(isRetryableControlledErrorCode("query_timeout")).toBe(true);
    expect(isRetryableControlledErrorCode("service_unavailable")).toBe(true);
    expect(isRetryableControlledErrorCode("forbidden")).toBe(false);
    expect(isRetryableControlledErrorCode("query_not_allowed")).toBe(false);
    expect(isRetryableControlledErrorCode("query_result_disclosure_blocked")).toBe(false);
    expect(isRetryableControlledErrorCode("not_found")).toBe(false);
    expect(isRetryableControlledErrorCode("saved_statement_not_found")).toBe(false);
    expect(isRetryableControlledErrorCode("query_target_not_found")).toBe(false);
    expect(isRetryableControlledErrorCode("validation_failed")).toBe(false);
    expect(isRetryableControlledErrorCode("query_explain_not_supported")).toBe(false);
    expect(isRetryableControlledErrorCode("brand_new_backend_code")).toBe(false);
  });
});

// ─── Phase 38S: Governed result paging contract ────────────────────────────

describe("Phase 38S: governed result paging request shape", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends exact pagination request body with page and pageSize", async () => {
    // Contract: executeQueryTarget accepts {statement, maxRows, pagination} and
    // sends the structured pagination object in the POST body for page-N requests.
    mockApiClient.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 2, pageSize: 25, hasPreviousPage: true, hasNextPage: true },
    });

    await executeQueryTarget(22, {
      statement: "select * from orders",
      maxRows: 100,
      pagination: { page: 2, pageSize: 25 },
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    expect(requestBody(init)).toEqual({
      statement: "select * from orders",
      maxRows: 100,
      pagination: { page: 2, pageSize: 25 },
    });
  });

  it("never sends phantom cursor or top-level pageSize fields", async () => {
    // Contract: the wire body contains only statement/maxRows/pagination — the
    // cursor-style fields were never part of the backend contract.
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, {
      statement: "select 1",
      maxRows: 100,
      pagination: { page: 1, pageSize: 10 },
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    const body = requestBody(init);
    expect(Object.keys(body).sort()).toEqual(["maxRows", "pagination", "statement"]);
    expect(body).not.toHaveProperty("cursor");
    expect(body).not.toHaveProperty("pageSize");
  });

  it("sends legacy request body without pagination fields when none provided", async () => {
    // Contract: backward compat — omitting pagination produces the Phase 37 shape.
    mockApiClient.mockResolvedValueOnce(buildExecuteResponse());

    await executeQueryTarget(22, { statement: "select 1" });

    const [, init] = mockApiClient.mock.calls[0]!;
    const body = requestBody(init);
    expect(body).toEqual({ statement: "select 1" });
    expect(body).not.toHaveProperty("cursor");
    expect(body).not.toHaveProperty("pageSize");
    expect(body).not.toHaveProperty("pageToken");
    expect(body).not.toHaveProperty("offset");
  });

  it("returns structured pagination response metadata unchanged", async () => {
    // Contract: paged response extends QueryExecuteResponse with a pagination object.
    const pagedResponse = {
      ...buildExecuteResponse(),
      pagination: { page: 2, pageSize: 25, hasPreviousPage: true, hasNextPage: true },
    };
    mockApiClient.mockResolvedValueOnce(pagedResponse);

    const result = await executeQueryTarget(22, {
      statement: "select * from orders",
      maxRows: 100,
      pagination: { page: 2, pageSize: 25 },
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 25,
      hasPreviousPage: true,
      hasNextPage: true,
    });
    expect(result).not.toHaveProperty("cursor");
    expect(result).not.toHaveProperty("hasMore");
    expect(result).not.toHaveProperty("requestId");
  });

  it("first page response has hasPreviousPage=false and hasNextPage=true when more rows exist", async () => {
    mockApiClient.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      rowCount: 25,
      pagination: { page: 1, pageSize: 25, hasPreviousPage: false, hasNextPage: true },
    });

    const result = await executeQueryTarget(22, {
      statement: "select * from big_table",
      pagination: { page: 1, pageSize: 25 },
    });

    expect(result.pagination?.hasPreviousPage).toBe(false);
    expect(result.pagination?.hasNextPage).toBe(true);
  });

  it("last page response has hasNextPage=false", async () => {
    mockApiClient.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      rowCount: 5,
      pagination: { page: 1, pageSize: 25, hasPreviousPage: false, hasNextPage: false },
    });

    const result = await executeQueryTarget(22, {
      statement: "select * from small_table",
      pagination: { page: 1, pageSize: 25 },
    });

    expect(result.pagination?.hasNextPage).toBe(false);
  });

  it("pageSize values [10, 25, 50, 100] are all accepted without error", async () => {
    // Contract: the allowed page-size values must all round-trip without validation errors.
    const allowedSizes = [10, 25, 50, 100];

    for (const size of allowedSizes) {
      mockApiClient.mockResolvedValueOnce({
        ...buildExecuteResponse(),
        pagination: { page: 1, pageSize: size, hasPreviousPage: false, hasNextPage: false },
      });

      await expect(
        executeQueryTarget(22, {
          statement: "select 1",
          pagination: { page: 1, pageSize: size },
        }),
      ).resolves.toBeDefined();

      const [, init] = mockApiClient.mock.calls[mockApiClient.mock.calls.length - 1]!;
      expect(requestBody(init)).toHaveProperty("pagination", { page: 1, pageSize: size });
    }
  });

  it("never sends client-side row slicing or SQL mutation", async () => {
    // Contract: the frontend must NOT append LIMIT/OFFSET or slice rows client-side.
    mockApiClient.mockResolvedValueOnce({
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 25, hasPreviousPage: false, hasNextPage: false },
    });

    await executeQueryTarget(22, {
      statement: "select * from orders",
      pagination: { page: 1, pageSize: 25 },
    });

    const [, init] = mockApiClient.mock.calls[0]!;
    const body = requestBody(init);
    // Statement must be sent verbatim — no LIMIT, OFFSET, or ROWS appended
    expect(body.statement).toBe("select * from orders");
    expect(String(body.statement)).not.toMatch(/\bLIMIT\b/i);
    expect(String(body.statement)).not.toMatch(/\bOFFSET\b/i);
    expect(String(body.statement)).not.toMatch(/\bFETCH\b/i);
  });
});

describe("Phase 38S: governed result paging QueryExecuteRequest type surface", () => {
  it("QueryExecuteRequest type accepts a structured pagination field", () => {
    // Type contract: paging is expressed only through the pagination object.
    // If the field is missing from the type, TypeScript compilation fails.
    const request: import("@/types/query-execution").QueryExecuteRequest = {
      statement: "select 1",
      pagination: { page: 2, pageSize: 25 },
    };
    expect(request.pagination).toEqual({ page: 2, pageSize: 25 });
  });

  it("QueryExecuteResponse type accepts structured pagination metadata", () => {
    const response: import("@/types/query-execution").QueryExecuteResponse = {
      ...buildExecuteResponse(),
      pagination: { page: 1, pageSize: 25, hasPreviousPage: false, hasNextPage: true },
    };
    expect(response.pagination).toEqual({
      page: 1,
      pageSize: 25,
      hasPreviousPage: false,
      hasNextPage: true,
    });
  });

  it("rejects the phantom cursor wire fields at the type level", () => {
    // These assignments must be type errors: the backend contract has no
    // cursor-style paging. If the phantom fields reappear on the types, the
    // expect-error directives below become unused and tsc fails.
    const badCursorRequest: import("@/types/query-execution").QueryExecuteRequest = {
      statement: "select 1",
      // @ts-expect-error QueryExecuteRequest has no `cursor` field
      cursor: "abc",
    };
    const badPageSizeRequest: import("@/types/query-execution").QueryExecuteRequest = {
      statement: "select 1",
      // @ts-expect-error QueryExecuteRequest has no top-level `pageSize` field
      pageSize: 25,
    };
    const badResponse: import("@/types/query-execution").QueryExecuteResponse = {
      ...buildExecuteResponse(),
      // @ts-expect-error QueryExecuteResponse has no `cursor`/`hasMore`/`requestId`
      cursor: "next",
      hasMore: true,
      requestId: "req-1",
    };
    expect(badCursorRequest.statement).toBe("select 1");
    expect(badPageSizeRequest.statement).toBe("select 1");
    expect(badResponse.executionId).toBe(1001);
  });
});
