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
    database: "",
    schema: "",
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
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
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
        activeSchema: null,
      },
    ]);
  });

  it("activates the worksheet bound to an explicit deep-linked target, not items[0]", () => {
    const session = createSession();
    // The pinned target (a ?targetId= deep link) must win over restore order:
    // otherwise the first persisted worksheet silently retargets the pin and
    // the deep link is dropped.
    session.hydrate(
      [
        {
          id: "saved-pg",
          name: "PG draft",
          targetResourceId: 105,
          statement: "select 1",
          activeDatabase: "labdb",
        },
        {
          id: "saved-mysql",
          name: "MySQL draft",
          targetResourceId: 104,
          statement: "select 2",
          activeDatabase: null,
        },
      ],
      104,
      true,
    );

    expect(session.active.id).toBe("saved-mysql");
    expect(session.active.targetResourceId).toBe(104);
  });

  it("falls back to items[0] when no restored worksheet binds the deep-linked target", () => {
    const session = createSession();
    session.hydrate(
      [
        {
          id: "saved-pg",
          name: "PG draft",
          targetResourceId: 105,
          statement: "select 1",
          activeDatabase: "labdb",
        },
      ],
      104,
      true,
    );

    expect(session.active.id).toBe("saved-pg");
  });

  it("keeps items[0] activation when the pin is not explicit", () => {
    const session = createSession();
    session.hydrate(
      [
        {
          id: "saved-pg",
          name: "PG draft",
          targetResourceId: 105,
          statement: "select 1",
          activeDatabase: "labdb",
        },
        {
          id: "saved-mysql",
          name: "MySQL draft",
          targetResourceId: 104,
          statement: "select 2",
          activeDatabase: null,
        },
      ],
      104,
    );

    expect(session.active.id).toBe("saved-pg");
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

describe("WorksheetSession PostgreSQL context", () => {
  function createPgSession(
    ports: ConstructorParameters<typeof WorksheetSession>[0]["ports"] = {},
  ) {
    let n = 0;
    return new WorksheetSession({
      initialTargetId: 7,
      createId: () => `key-${++n}`,
      ports,
      engineFor: () => "postgresql",
    });
  }

  function pgResult(overrides: Partial<QueryExecuteResponse> = {}): QueryExecuteResponse {
    return emptyResult({
      engine: "postgresql",
      context: { database: "orders", schema: "sales" },
      ...overrides,
    });
  }

  function historyExecution(
    overrides: Partial<import("@/types/query-execution").QueryExecutionHistoryExecution> = {},
  ): import("@/types/query-execution").QueryExecutionHistoryExecution {
    return {
      kind: "execution",
      id: 5,
      targetResourceId: 7,
      clientExecutionId: "key-1",
      actor: null,
      engine: "postgresql",
      database: "orders",
      schema: "sales",
      statementDigest: "d",
      statementPreview: "select 1",
      canRestore: false,
      status: "cancelled",
      rowCount: 0,
      durationMs: 3,
      errorCode: "",
      errorMessage: "",
      createdAt: "2026-08-01T00:00:00Z",
      remoteState: "stopped",
      ...overrides,
    };
  }

  it("refuses to run before a composite connection database is selected", async () => {
    const execute = vi.fn();
    const session = createPgSession({ execute });
    session.editStatement("select 1");
    await session.run();
    expect(execute).not.toHaveBeenCalled();
    expect(session.active.isExecuting).toBe(false);
  });

  it("sends database/schema and the pinned key, then trusts only a matching context echo", async () => {
    const execute = vi.fn().mockResolvedValue(pgResult());
    const session = createPgSession({ execute });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");
    await session.run();
    expect(execute).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        statement: "select 1",
        database: "orders",
        schema: "sales",
        clientExecutionId: expect.any(String),
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(session.active.result?.rowCount).toBe(0);
  });

  it("fails closed when the echoed context does not match the request binding", async () => {
    const execute = vi.fn().mockResolvedValue(
      pgResult({ context: { database: "other", schema: "sales" } }),
    );
    const session = createPgSession({ execute });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");
    await session.run();
    expect(session.active.result).toBeNull();
    expect(session.active.error?.code).toBe("internal_error");
  });

  it("selectConnection clears result/schema and rebinds history scope to the new database", async () => {
    const execute = vi.fn().mockResolvedValue(pgResult());
    const listExecutions = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const session = createPgSession({ execute, listExecutions });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");
    await session.run();
    expect(session.active.result).not.toBeNull();

    session.selectConnection(session.active.id, "billing");
    expect(session.active.activeDatabase).toBe("billing");
    expect(session.active.activeSchema).toBeNull();
    expect(session.active.result).toBeNull();
    expect(session.active.statement).toBe("select 1");
    expect(session.active.history.boundDatabase).toBe("billing");

    await session.refreshHistory();
    expect(listExecutions).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ database: "billing" }),
    );
  });

  it("selectSchema clears result and navigation state but keeps the draft statement", async () => {
    const execute = vi.fn().mockResolvedValue(pgResult());
    const session = createPgSession({ execute });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");
    await session.run();
    expect(session.active.result).not.toBeNull();

    session.selectSchema(session.active.id, "ops");
    expect(session.active.activeSchema).toBe("ops");
    expect(session.active.activeDatabase).toBe("orders");
    expect(session.active.result).toBeNull();
    expect(session.active.statement).toBe("select 1");
  });

  it("reconcileConnection stops a worksheet whose connection vanished — no silent fallback", () => {
    const session = createPgSession();
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");

    session.reconcileConnection(session.active.id, ["billing"]);
    expect(session.active.activeDatabase).toBeNull();
    expect(session.active.activeSchema).toBeNull();
    expect(session.active.result).toBeNull();

    // still listed → untouched
    session.selectConnection(session.active.id, "orders");
    session.reconcileConnection(session.active.id, ["orders", "billing"]);
    expect(session.active.activeDatabase).toBe("orders");
  });

  it("persists and restores the schema pin alongside the database", () => {
    const session = createPgSession();
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    const snapshot = session.persistedSnapshot();
    expect(snapshot[0]).toMatchObject({ activeDatabase: "orders", activeSchema: "sales" });

    const restored = createPgSession();
    restored.hydrate(snapshot, 0);
    expect(restored.active.activeDatabase).toBe("orders");
    expect(restored.active.activeSchema).toBe("sales");
  });

  it("cancel aborts the request and resolves through a keyed history probe", async () => {
    let abortSignal: AbortSignal | undefined;
    const execute = vi.fn().mockImplementation(
      (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
        new Promise<QueryExecuteResponse>((_resolve, reject) => {
          abortSignal = opts?.signal;
          abortSignal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    const listExecutions = vi.fn().mockImplementation(
      (_id: number, params?: { clientExecutionId?: string }) =>
        Promise.resolve({
          items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
          nextCursor: null,
        }),
    );
    const session = createPgSession({ execute, listExecutions });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");

    const running = session.run();
    await vi.waitFor(() => expect(execute).toHaveBeenCalled());
    const sentKey = (execute.mock.calls[0]![1] as { clientExecutionId?: string }).clientExecutionId;
    expect(sentKey).toBeTruthy();
    session.cancel();
    expect(abortSignal?.aborted).toBe(true);
    await running;

    await vi.waitFor(() => {
      expect(session.active.cancellation.phase).toBe("resolved");
    });
    expect(listExecutions).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        database: "orders",
        clientExecutionId: sentKey,
        // The read-back poll runs on its own fresh signal — never the aborted
        // request's, which is already aborted by the time the probe starts.
        signal: expect.any(AbortSignal),
      }),
    );
    if (session.active.cancellation.phase === "resolved") {
      expect(session.active.cancellation.outcome).toEqual({
        kind: "terminal",
        status: "cancelled",
        remoteState: "stopped",
      });
    }
    // No synthesized failure row on the worksheet.
    expect(session.active.error).toBeNull();
  });

  it("navigateRelated sends the composite source scope and a fresh key", async () => {
    const navigateRelated = vi.fn().mockResolvedValue({ rows: [], columns: [] });
    const session = createPgSession({ navigateRelated });
    session.openPreview({
      targetId: 7,
      database: "orders",
      schema: "sales",
      table: "orders",
      foreignKeys: [{
        name: "fk_tenant",
        columns: ["tenant_id"],
        referencedDatabase: "orders",
        referencedSchema: "core",
        referencedObject: "tenants",
        referencedColumns: ["id"],
        onUpdate: "cascade",
        onDelete: "restrict",
      }],
      foreignKeysTruncated: false,
    });
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalled());
    const [targetId, request] = navigateRelated.mock.calls[0]!;
    expect(targetId).toBe(7);
    expect(request).toMatchObject({
      source: { database: "orders", schema: "sales", object: "orders" },
      localValues: ["7"],
      clientExecutionId: expect.any(String),
    });
  });

  it("fails closed when the related-records context echo mismatches the bound scope", async () => {
    const navigateRelated = vi.fn().mockResolvedValue(
      pgResult({ context: { database: "other_db", schema: "sales" } }),
    );
    const session = createPgSession({ navigateRelated });
    session.openPreview({
      targetId: 7,
      database: "orders",
      schema: "sales",
      table: "orders",
      foreignKeys: [{
        name: "fk_tenant",
        columns: ["tenant_id"],
        referencedDatabase: "orders",
        referencedSchema: "core",
        referencedObject: "tenants",
        referencedColumns: ["id"],
        onUpdate: "cascade",
        onDelete: "restrict",
      }],
      foreignKeysTruncated: false,
    });
    session.navigateRelated("fk_tenant", ["7"]);

    await vi.waitFor(() => {
      expect(session.active.relatedRecords.status).toBe("error");
    });
    if (session.active.relatedRecords.status === "error") {
      expect(session.active.relatedRecords.code).toBe("internal_error");
    }
  });

  it("restores history scoped to the persisted connection on hydrate", () => {
    const session = createPgSession();
    session.selectConnection(session.active.id, "orders");
    const snapshot = session.persistedSnapshot();

    const restored = createPgSession();
    restored.hydrate(snapshot, 0);
    expect(restored.active.activeDatabase).toBe("orders");
    expect(restored.active.history.boundDatabase).toBe("orders");
  });

  it("re-binds restored history when the engine map was empty at hydrate time", () => {
    const engines = new Map<number, string>();
    let n = 0;
    const session = new WorksheetSession({
      initialTargetId: 7,
      createId: () => `key-${++n}`,
      engineFor: (id) => engines.get(id),
    });
    session.hydrate(
      [{
        id: "w1",
        name: "W1",
        targetResourceId: 7,
        statement: "select 1",
        activeDatabase: "orders",
        activeSchema: "sales",
      }],
      7,
    );
    // Engine unknown at hydrate → history stays unscoped for now.
    expect(session.active.history.boundDatabase).toBeNull();

    engines.set(7, "postgresql");
    session.reconcileConnection(session.active.id, ["orders"]);
    expect(session.active.history.boundDatabase).toBe("orders");
  });

  function previewInput() {
    return {
      targetId: 7,
      database: "orders",
      schema: "sales",
      table: "orders",
      foreignKeys: [{
        name: "fk_tenant",
        columns: ["tenant_id"],
        referencedDatabase: "orders",
        referencedSchema: "core",
        referencedObject: "tenants",
        referencedColumns: ["id"],
        onUpdate: "cascade",
        onDelete: "restrict",
      }],
      foreignKeysTruncated: false,
    };
  }

  function pgNavResponse(rowCount = 0) {
    return {
      columns: [],
      rows: [],
      rowCount,
      context: { database: "orders", schema: "sales" },
    };
  }

  it("reuses the in-flight navigation attempt for a repeated identical intent — one key, one POST", async () => {
    let resolveNav: ((value: unknown) => void) | undefined;
    const signals: AbortSignal[] = [];
    const navigateRelated = vi.fn().mockImplementation(
      (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        return new Promise((resolve) => {
          resolveNav = resolve;
        });
      },
    );
    const session = createPgSession({ navigateRelated });
    session.openPreview(previewInput());

    session.navigateRelated("fk_tenant", ["7"]);
    session.navigateRelated("fk_tenant", ["7"]);
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(1));

    // The attempt carries a real signal and is not aborted by the dedup.
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);
    resolveNav?.(pgNavResponse());
    await vi.waitFor(() =>
      expect(session.active.relatedRecords.status).toBe("ready"),
    );
  });

  it("supersedes a different intent: aborts the old request and reads its keyed state back under the pinned scope", async () => {
    const signals: AbortSignal[] = [];
    const navigateRelated = vi.fn().mockImplementation(
      (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        return new Promise(() => {});
      },
    );
    const listExecutions = vi.fn().mockImplementation(
      (_id: number, params?: { clientExecutionId?: string }) =>
        Promise.resolve({
          items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
          nextCursor: null,
        }),
    );
    const session = createPgSession({ navigateRelated, listExecutions });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(1));
    const keyA = navigateRelated.mock.calls[0]![1].clientExecutionId;

    session.navigateRelated("fk_tenant", ["8"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(2));
    const keyB = navigateRelated.mock.calls[1]![1].clientExecutionId;
    expect(keyB).not.toBe(keyA);
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);

    // The superseded keyed attempt is read back under its own key/database —
    // the old SQL is not pretended never to have run.
    await vi.waitFor(() =>
      expect(listExecutions).toHaveBeenCalledWith(
        7,
        expect.objectContaining({ clientExecutionId: keyA, database: "orders" }),
      ),
    );
    await vi.waitFor(() =>
      expect(session.active.cancellation.phase).toBe("resolved"),
    );
  });

  it("closing the panel aborts the in-flight navigation request", async () => {
    const signals: AbortSignal[] = [];
    const navigateRelated = vi.fn().mockImplementation(
      (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        return new Promise(() => {});
      },
    );
    const listExecutions = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const session = createPgSession({ navigateRelated, listExecutions });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(1));

    session.closeRelatedRecords();
    expect(signals[0]?.aborted).toBe(true);
    expect(session.active.relatedRecords.status).toBe("idle");
    await vi.waitFor(() => expect(listExecutions).toHaveBeenCalled());
  });

  it("a context switch aborts a pending navigation without claiming an outcome", async () => {
    const signals: AbortSignal[] = [];
    const navigateRelated = vi.fn().mockImplementation(
      (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        return new Promise(() => {});
      },
    );
    const session = createPgSession({ navigateRelated });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(1));

    session.selectConnection(session.active.id, "billing");
    expect(signals[0]?.aborted).toBe(true);
    expect(session.active.relatedRecords.status).toBe("idle");
    expect(session.active.cancellation.phase).toBe("idle");
  });

  it("converts an execution_already_exists navigation rejection into a keyed state read — no re-POST, no new key", async () => {
    const navigateRelated = vi.fn().mockRejectedValue(
      new QueryExecuteError(409, "execution_already_exists", "already exists"),
    );
    const listExecutions = vi.fn().mockImplementation(
      (_id: number, params?: { clientExecutionId?: string }) =>
        Promise.resolve({
          items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
          nextCursor: null,
        }),
    );
    const session = createPgSession({ navigateRelated, listExecutions });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() =>
      expect(session.active.relatedRecords.status).toBe("error"),
    );
    const key = navigateRelated.mock.calls[0]![1].clientExecutionId;
    expect(navigateRelated).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(session.active.cancellation.phase).toBe("resolved"),
    );
    expect(listExecutions).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ clientExecutionId: key, database: "orders" }),
    );
  });

  it("stops explicitly on client_execution_id_conflict — no probe, no retry", async () => {
    const navigateRelated = vi.fn().mockRejectedValue(
      new QueryExecuteError(409, "client_execution_id_conflict", "conflict"),
    );
    const listExecutions = vi.fn();
    const session = createPgSession({ navigateRelated, listExecutions });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() =>
      expect(session.active.relatedRecords.status).toBe("error"),
    );
    expect(navigateRelated).toHaveBeenCalledTimes(1);
    expect(listExecutions).not.toHaveBeenCalled();
    expect(session.active.cancellation.phase).toBe("idle");
  });

  it("drops a late superseded navigation response instead of overwriting the current intent", async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const navigateRelated = vi.fn().mockImplementation(
      () => new Promise((resolve) => resolvers.push(resolve)),
    );
    const session = createPgSession({ navigateRelated });
    session.openPreview(previewInput());
    session.navigateRelated("fk_tenant", ["7"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(1));
    session.navigateRelated("fk_tenant", ["8"]);
    await vi.waitFor(() => expect(navigateRelated).toHaveBeenCalledTimes(2));

    resolvers[1]?.(pgNavResponse(2));
    await vi.waitFor(() =>
      expect(session.active.relatedRecords.status).toBe("ready"),
    );
    if (session.active.relatedRecords.status === "ready") {
      expect(session.active.relatedRecords.response.rowCount).toBe(2);
    }
    resolvers[0]?.(pgNavResponse(1));
    await Promise.resolve();
    if (session.active.relatedRecords.status === "ready") {
      expect(session.active.relatedRecords.response.rowCount).toBe(2);
    }
  });

  it("converts an execution_already_exists execute rejection into a keyed state read", async () => {
    const execute = vi.fn().mockRejectedValue(
      new QueryExecuteError(409, "execution_already_exists", "already exists"),
    );
    const listExecutions = vi.fn().mockImplementation(
      (_id: number, params?: { clientExecutionId?: string }) =>
        Promise.resolve({
          items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
          nextCursor: null,
        }),
    );
    const session = createPgSession({ execute, listExecutions });
    session.selectConnection(session.active.id, "orders");
    session.selectSchema(session.active.id, "sales");
    session.editStatement("select 1");
    await session.run();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(session.active.error).toBeNull();
    await vi.waitFor(() =>
      expect(session.active.cancellation.phase).toBe("resolved"),
    );
    const key = execute.mock.calls[0]![1].clientExecutionId;
    expect(listExecutions).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ clientExecutionId: key, database: "orders" }),
    );
  });

  it("aborts a pending probe read on context switch and leaves nothing stuck", async () => {
    vi.useFakeTimers();
    try {
      let executeSignal: AbortSignal | undefined;
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) => {
          executeSignal = opts?.signal;
          return new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          );
        },
      );
      const probeSignals: AbortSignal[] = [];
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { signal?: AbortSignal }) => {
          if (params?.signal) probeSignals.push(params.signal);
          return new Promise(() => {});
        },
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await vi.advanceTimersByTimeAsync(0);
      expect(listExecutions).toHaveBeenCalledTimes(1);

      session.selectConnection(session.active.id, "billing");
      await vi.advanceTimersByTimeAsync(0);
      expect(probeSignals[0]?.aborted).toBe(true);
      expect(session.active.cancellation.phase).toBe("idle");
      expect(executeSignal?.aborted).toBe(true);
      session.dispose();
      await running.catch(() => {});
    } finally {
      vi.useRealTimers();
    }
  });

  it("a hanging GET consumes the shared probe window and resolves unknown", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      const probeSignals: AbortSignal[] = [];
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            if (params?.signal) probeSignals.push(params.signal);
            params?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});

      // One GET holds the whole window: no fresh per-poll budget.
      await vi.advanceTimersByTimeAsync(11_000);
      expect(listExecutions).toHaveBeenCalledTimes(1);
      expect(probeSignals[0]?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.active.cancellation.phase).toBe("resolved");
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({ kind: "unknown" });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a running claim followed by a deadline-interrupted read resolves unknown, not stale running", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      let getCalls = 0;
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { signal?: AbortSignal; clientExecutionId?: string }) => {
          getCalls += 1;
          if (getCalls === 1) {
            // GET1 completes inside the window: a still-running claim.
            return Promise.resolve({
              items: [{
                kind: "claim" as const,
                clientExecutionId: params?.clientExecutionId ?? null,
                status: "running",
              }],
              nextCursor: null,
            });
          }
          // GET2 never answers — only the shared deadline can abort it.
          return new Promise((_resolve, reject) =>
            params?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          );
        },
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});

      await vi.advanceTimersByTimeAsync(0);
      expect(listExecutions).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(400);
      expect(listExecutions).toHaveBeenCalledTimes(2);

      // The second read dies on the shared deadline without producing a
      // current state — the stale GET1 `running` must not be reused as this
      // round's conclusion.
      await vi.advanceTimersByTimeAsync(11_000);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.active.cancellation.phase).toBe("resolved");
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({ kind: "unknown" });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a deadline-interrupted backoff wait keeps the last completed read (running), unlike a killed in-flight GET", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { clientExecutionId?: string }) =>
          Promise.resolve({
            items: [{
              kind: "claim" as const,
              clientExecutionId: params?.clientExecutionId ?? null,
              status: "running",
            }],
            nextCursor: null,
          }),
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});

      // GETs keep answering running; the deadline fires while the last
      // backoff wait is in flight. Unlike an interrupted READ, an interrupted
      // wait lost no observation — the last completed read is still the
      // honest conclusion (the normal continuous-running control).
      await vi.advanceTimersByTimeAsync(6_000);
      expect(session.active.cancellation.phase).toBe("requested");
      await vi.advanceTimersByTimeAsync(5_100);
      await vi.advanceTimersByTimeAsync(0);
      expect(session.active.cancellation.phase).toBe("resolved");
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({ kind: "running" });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a terminal row observed before the deadline is never downgraded by a later read failure", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      let getCalls = 0;
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { clientExecutionId?: string }) => {
          getCalls += 1;
          if (getCalls === 1) {
            return Promise.resolve({
              items: [{
                kind: "claim" as const,
                clientExecutionId: params?.clientExecutionId ?? null,
                status: "running",
              }],
              nextCursor: null,
            });
          }
          return Promise.resolve({
            items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
            nextCursor: null,
          });
        },
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});
      await vi.advanceTimersByTimeAsync(400);

      await vi.waitFor(() =>
        expect(session.active.cancellation.phase).toBe("resolved"),
      );
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({
          kind: "terminal",
          status: "cancelled",
          remoteState: "stopped",
        });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("aborts a backoff wait when the session is disposed mid-probe", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { clientExecutionId?: string }) =>
          Promise.resolve({
            items: [{
              kind: "claim" as const,
              clientExecutionId: params?.clientExecutionId ?? null,
              status: "running",
            }],
            nextCursor: null,
          }),
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(listExecutions).toHaveBeenCalledTimes(1);

      // Disposal during the 400ms backoff: no further polls ever happen.
      session.dispose();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(listExecutions).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a superseded probe cannot overwrite the newer attempt's outcome", async () => {
    vi.useFakeTimers();
    try {
      const executeSignals: AbortSignal[] = [];
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            if (opts?.signal) executeSignals.push(opts.signal);
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
      );
      const probeSignals: AbortSignal[] = [];
      const pendingGet = new Promise<never>(() => {});
      let getCalls = 0;
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { signal?: AbortSignal; clientExecutionId?: string }) => {
          if (params?.signal) probeSignals.push(params.signal);
          getCalls += 1;
          if (getCalls === 1) return pendingGet;
          return Promise.resolve({
            items: [historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })],
            nextCursor: null,
          });
        },
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");

      const first = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await first.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);
      expect(listExecutions).toHaveBeenCalledTimes(1);

      // A second run + cancel supersedes the first probe.
      session.editStatement("select 2");
      const second = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await second.catch(() => {});
      await vi.advanceTimersByTimeAsync(0);

      // The old probe's pending read was aborted when the new probe took over.
      expect(probeSignals[0]?.aborted).toBe(true);
      const keyB = execute.mock.calls[1]![1].clientExecutionId;
      await vi.waitFor(() =>
        expect(session.active.cancellation.phase).toBe("resolved"),
      );
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.key).toBe(keyB);
        expect(session.active.cancellation.outcome).toEqual({
          kind: "terminal",
          status: "cancelled",
          remoteState: "stopped",
        });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshCancellation re-reads a resolved non-terminal outcome under the same key", async () => {
    vi.useFakeTimers();
    try {
      const execute = vi.fn().mockImplementation(
        (_id: number, _req: unknown, opts?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            opts?.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            ),
          ),
      );
      let terminal = false;
      const listExecutions = vi.fn().mockImplementation(
        (_id: number, params?: { clientExecutionId?: string }) =>
          Promise.resolve({
            items: [
              terminal
                ? historyExecution({ clientExecutionId: params?.clientExecutionId ?? null })
                : {
                    kind: "claim" as const,
                    clientExecutionId: params?.clientExecutionId ?? null,
                    status: "running",
                  },
            ],
            nextCursor: null,
          }),
      );
      const session = createPgSession({ execute, listExecutions });
      session.selectConnection(session.active.id, "orders");
      session.selectSchema(session.active.id, "sales");
      session.editStatement("select 1");
      const running = session.run();
      await vi.advanceTimersByTimeAsync(0);
      session.cancel();
      await running.catch(() => {});
      await vi.advanceTimersByTimeAsync(11_000);

      expect(session.active.cancellation.phase).toBe("resolved");
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({ kind: "running" });
      }

      terminal = true;
      session.refreshCancellation();
      expect(session.active.cancellation.phase).toBe("requested");
      await vi.advanceTimersByTimeAsync(0);
      expect(session.active.cancellation.phase).toBe("resolved");
      if (session.active.cancellation.phase === "resolved") {
        expect(session.active.cancellation.outcome).toEqual({
          kind: "terminal",
          status: "cancelled",
          remoteState: "stopped",
        });
      }
      session.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
