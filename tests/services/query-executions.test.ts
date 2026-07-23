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
  listQueryExecutions,
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

  it("maps 403 with disclosure_blocked message to query_result_disclosure_blocked", async () => {
    mockApiClient.mockRejectedValueOnce(
      new ApiError(403, "query_result_disclosure_blocked: column masked"),
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

  it("maps HTTP statuses including 409 to controlled error codes", async () => {
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
      mockApiClient.mockRejectedValueOnce(new ApiError(status, "blocked"));
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
        "listQueryExecutions",
        "navigateRelatedRecords",
      ].sort(),
    );
  });
});
