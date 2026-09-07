// input: @/lib/worksheet-session
// output: Vitest tests for 工作表 commands (template mode, execute routing, stale guard)
// pos: worksheet session interface is the test surface
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it, vi } from "vitest";

import { QueryExecuteError } from "@/services/query-executions";
import { MAX_WORKSHEETS, WorksheetSession } from "@/lib/worksheet-session";
import type { QueryExecuteResponse } from "@/types/query-execution";
import type { QuerySavedStatementRecord } from "@/types/query-saved-statement";

function emptyResult(overrides: Partial<QueryExecuteResponse> = {}): QueryExecuteResponse {
  return {
    executionId: 1,
    status: "success",
    targetResourceId: 1,
    engine: "mysql",
    columns: [],
    rows: [],
    rowCount: 0,
    truncated: false,
    durationMs: 1,
    limitApplied: 100,
    executedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function savedStatement(
  overrides: Partial<QuerySavedStatementRecord> = {},
): QuerySavedStatementRecord {
  return {
    id: 42,
    targetResourceId: 1,
    name: "orders by status",
    statement: "SELECT * FROM orders WHERE status = :status",
    scope: "personal",
    parameters: [{ name: "status", type: "string" }],
    createdAt: "2026-08-01T00:00:00Z",
    updatedAt: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

function createSession(ports: ConstructorParameters<typeof WorksheetSession>[0]["ports"] = {}) {
  let n = 0;
  return new WorksheetSession({
    initialTargetId: 1,
    createId: () => `id-${++n}`,
    ports,
  });
}

describe("WorksheetSession template mode", () => {
  it("enters template mode only when the loaded statement has parameters", () => {
    const session = createSession();
    session.loadSavedStatement(savedStatement());
    expect(session.active.templateStatementId).toBe(42);
    expect(session.active.parameters).toEqual([{ name: "status", type: "string" }]);

    session.loadSavedStatement(savedStatement({ id: 7, parameters: [], statement: "select 1" }));
    expect(session.active.templateStatementId).toBeNull();
  });

  it("exits template mode when the SQL text is replaced", () => {
    const session = createSession();
    session.loadSavedStatement(savedStatement());
    session.replaceStatement("select 2");
    expect(session.active.templateStatementId).toBeNull();
    expect(session.active.parameters).toEqual([]);
  });

  it("exits template mode on retarget", () => {
    const session = createSession();
    session.loadSavedStatement(savedStatement());
    session.retarget(session.active.id, 99);
    expect(session.active.templateStatementId).toBeNull();
    expect(session.active.targetResourceId).toBe(99);
    expect(session.active.activeDatabase).toBeNull();
  });

  it("does not explain while in template mode", async () => {
    const explain = vi.fn();
    const session = createSession({ explain });
    session.loadSavedStatement(savedStatement());
    await session.explain();
    expect(explain).not.toHaveBeenCalled();
  });
});

describe("WorksheetSession run routing", () => {
  it("runs ordinary SQL through the execute port", async () => {
    const execute = vi.fn().mockResolvedValue(emptyResult());
    const executeTemplate = vi.fn();
    const session = createSession({ execute, executeTemplate });
    session.replaceStatement("select 1");
    await session.run();
    expect(execute).toHaveBeenCalledTimes(1);
    expect(executeTemplate).not.toHaveBeenCalled();
    expect(session.active.result?.rowCount).toBe(0);
    expect(session.active.isExecuting).toBe(false);
  });

  it("runs a parameterized saved statement through the template port", async () => {
    const execute = vi.fn();
    const executeTemplate = vi.fn().mockResolvedValue(emptyResult({ rowCount: 2 }));
    const session = createSession({ execute, executeTemplate });
    session.loadSavedStatement(savedStatement());
    session.setParameterValue("status", "open");
    await session.run();
    expect(executeTemplate).toHaveBeenCalledWith(
      1,
      42,
      expect.objectContaining({
        values: { status: "open" },
      }),
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not run a template with empty parameter values", async () => {
    const executeTemplate = vi.fn();
    const session = createSession({ executeTemplate });
    session.loadSavedStatement(savedStatement());
    await session.run();
    expect(executeTemplate).not.toHaveBeenCalled();
    expect(session.active.isExecuting).toBe(false);
  });

  it("ignores a stale page response after SQL is replaced", async () => {
    let resolveFirst: (value: QueryExecuteResponse) => void = () => {};
    const first = new Promise<QueryExecuteResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const execute = vi.fn().mockImplementation(() => first);
    const session = createSession({ execute });
    session.replaceStatement("select 1");
    const pending = session.run();
    session.replaceStatement("select 2");
    resolveFirst(emptyResult({ rowCount: 1 }));
    await pending;
    expect(session.active.result).toBeNull();
    expect(session.active.statement).toBe("select 2");
  });

  it("maps template field errors onto the worksheet", async () => {
    const executeTemplate = vi.fn().mockRejectedValue(
      new QueryExecuteError(400, "validation_failed", "invalid", { status: "invalid" }),
    );
    const session = createSession({ executeTemplate });
    session.loadSavedStatement(savedStatement());
    session.setParameterValue("status", "nope");
    await session.run();
    expect(session.active.templateFieldErrors).toEqual({ status: "invalid" });
    expect(session.active.result).toBeNull();
  });
});

describe("WorksheetSession persisted drafts", () => {
  it("hydrates saved drafts without carrying result or template state", () => {
    const session = createSession();
    session.replaceStatement("select 9");
    session.hydrate(
      [
        {
          id: "saved-orders",
          name: "Orders draft",
          targetResourceId: 30,
          statement: "select * from orders",
          activeDatabase: "orders",
        },
      ],
      1,
    );
    expect(session.active.id).toBe("saved-orders");
    expect(session.active.statement).toBe("select * from orders");
    expect(session.active.activeDatabase).toBe("orders");
    expect(session.active.result).toBeNull();
    expect(session.active.templateStatementId).toBeNull();
    expect(session.persistedSnapshot()).toEqual([
      {
        id: "saved-orders",
        name: "Orders draft",
        targetResourceId: 30,
        statement: "select * from orders",
        activeDatabase: "orders",
      },
    ]);
  });

  it("refuses a thirty-third worksheet so persist and restore stay inside the cap", () => {
    const session = createSession();
    for (let index = 0; index < MAX_WORKSHEETS - 1; index += 1) {
      expect(session.add(1)).not.toBeNull();
    }
    expect(session.list).toHaveLength(MAX_WORKSHEETS);
    expect(session.add(1)).toBeNull();
    expect(session.restoreDraft({ targetId: 1, statement: "select 3", activeDatabase: null })).toBeNull();
    expect(session.list).toHaveLength(MAX_WORKSHEETS);
  });
});
