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

  it("exits template mode on a typed SQL edit and drops the template result", async () => {
    const executeTemplate = vi.fn().mockResolvedValue(emptyResult({ rowCount: 2 }));
    const session = createSession({ executeTemplate });
    session.loadSavedStatement(savedStatement());
    session.setParameterValue("status", "open");
    await session.run();
    expect(session.active.result?.rowCount).toBe(2);

    session.editStatement(`${session.active.statement} AND 1 = 1`);
    expect(session.active.templateStatementId).toBeNull();
    expect(session.active.parameters).toEqual([]);
    expect(session.active.parameterValues).toEqual({});
    expect(session.active.result).toBeNull();
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

  it("keeps an ordinary result while typing and skips notify when the text is unchanged", async () => {
    const execute = vi.fn().mockResolvedValue(emptyResult({ rowCount: 4 }));
    const session = createSession({ execute });
    session.replaceStatement("select 1");
    await session.run();
    const generation = session.active.relatedRecords.generation;
    const version = session.getSnapshot();

    session.editStatement("select 1");
    expect(session.getSnapshot()).toBe(version);
    expect(session.active.result?.rowCount).toBe(4);

    session.editStatement("select 1 from dual");
    expect(session.active.statement).toBe("select 1 from dual");
    expect(session.active.isDirty).toBe(true);
    expect(session.active.result?.rowCount).toBe(4);
    expect(session.active.relatedRecords.generation).toBe(generation);

    const afterFirstEdit = session.getSnapshot();
    session.editStatement("select 1 from dual where 1 = 1");
    expect(session.active.result?.rowCount).toBe(4);
    expect(session.active.relatedRecords.generation).toBe(generation);
    expect(session.getSnapshot()).toBeGreaterThan(afterFirstEdit);
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

  it("ignores a stale page response after a typed SQL edit", async () => {
    let resolveFirst: (value: QueryExecuteResponse) => void = () => {};
    const first = new Promise<QueryExecuteResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const execute = vi.fn().mockImplementation(() => first);
    const session = createSession({ execute });
    session.editStatement("select 1");
    const pending = session.run();
    session.editStatement("select 2");
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

describe("WorksheetSession cellTruncated result-contract propagation", () => {
  function truncatedResult(flags: boolean[][]): QueryExecuteResponse {
    const columns = flags[0]?.map((_, index) => ({
      name: `c${index}`,
      databaseType: "VARCHAR",
      nullable: true,
      displayMode: "raw_copy_allowed" as const,
      copyAllowed: true,
    })) ?? [];
    return emptyResult({
      columns,
      rows: flags.map((row) => row.map(() => "v")),
      rowCount: flags.length,
      cellTruncated: flags,
    });
  }

  it("stores the delivered matrix on the worksheet result after run()", async () => {
    const execute = vi.fn().mockResolvedValue(truncatedResult([[false, true], [false, false]]));
    const session = createSession({ execute });
    session.editStatement("select 1");
    await session.run();

    expect(session.active.result?.cellTruncated).toEqual([[false, true], [false, false]]);
    // WHY: the flag must stay bound to its (row, column) position so the grid
    // and CSV gate never misattribute truncation to a neighboring cell.
    expect(session.active.result?.cellTruncated?.[0]?.[1]).toBe(true);
  });

  it("clears the prior result and matrix when a rerun fails (409 contract refusal)", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(truncatedResult([[true]]))
      .mockRejectedValueOnce(
        new QueryExecuteError(409, "result_contract_upgrade_required", "upgrade required"),
      );
    const session = createSession({ execute });
    session.editStatement("select 1");
    await session.run();
    expect(session.active.result?.cellTruncated).toEqual([[true]]);

    await session.run();
    // WHY: a delivery refusal is terminal for the visible page — the stale
    // truncated result must not remain exportable under the failed request.
    expect(session.active.result).toBeNull();
    expect(session.active.error?.code).toBe("result_contract_upgrade_required");
  });

  it("isolates result matrices between worksheets when switching tabs", async () => {
    const execute = vi.fn().mockResolvedValue(truncatedResult([[true]]));
    const session = createSession({ execute });
    session.editStatement("select 1");
    await session.run();
    const firstId = session.active.id;

    const second = session.add(1);
    expect(second).not.toBeNull();
    expect(session.active.id).not.toBe(firstId);
    expect(session.active.result).toBeNull();

    session.activate(firstId);
    expect(session.active.result?.cellTruncated).toEqual([[true]]);
  });

  it("replaces the page matrix on nextPage rather than merging pages", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(
        truncatedResult([[true]]),
      )
      .mockResolvedValueOnce(
        {
          ...truncatedResult([[false]]),
          pagination: { page: 2, pageSize: 10, hasPreviousPage: true, hasNextPage: false },
        },
      );
    const session = createSession({ execute });
    session.editStatement("select 1");
    // Seed pagination metadata so nextPage() is legal.
    await session.run();
    session.patchActive({
      resultPagination: { page: 1, pageSize: 10, hasPreviousPage: false, hasNextPage: true },
    });
    await session.nextPage();

    // WHY: page 2's matrix replaces page 1's — concatenating the old page's
    // rows with the new page's matrix would misalign every flag.
    expect(session.active.result?.cellTruncated).toEqual([[false]]);
    expect(session.active.currentPage).toBe(2);
  });

  it("keeps the related-records matrix inside the navigation state", async () => {
    const navigateRelated = vi.fn().mockResolvedValue(
      Object.assign(truncatedResult([[false, true]]), {
        sourceDatabase: "db",
        sourceObject: "orders",
        foreignKey: "fk",
        referencedDatabase: "db",
        referencedObject: "users",
        referencedColumns: ["id"],
      }),
    );
    const session = createSession({ navigateRelated });
    session.openPreview({
      targetId: 1,
      database: "db",
      table: "orders",
      foreignKeys: [{
        name: "fk",
        columns: ["user_id"],
        referencedDatabase: "db",
        referencedObject: "users",
        referencedColumns: ["id"],
        onUpdate: "cascade",
        onDelete: "restrict",
      }],
      foreignKeysTruncated: false,
    });
    session.navigateRelated("fk", ["7"]);

    await vi.waitFor(() => {
      expect(session.active.relatedRecords.status).toBe("ready");
    });
    if (session.active.relatedRecords.status === "ready") {
      expect(session.active.relatedRecords.response.cellTruncated).toEqual([[false, true]]);
    }
  });

  it("never persists result rows, matrices, or parameter values into the workspace snapshot", async () => {
    const execute = vi.fn().mockResolvedValue(truncatedResult([[true]]));
    const session = createSession({ execute });
    session.editStatement("select 1");
    await session.run();
    session.setParameterValue("p", "secret-value");

    const snapshot = session.persistedSnapshot();
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain("cellTruncated");
    expect(serialized).not.toContain("result");
    expect(serialized).not.toContain("parameterValues");
    expect(serialized).not.toContain("secret-value");
  });
});
