import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  APPROVED_KEYWORDS,
  FORBIDDEN_KEYWORDS,
  buildKeywordCompletions,
  buildTableCompletions,
  buildDatabaseQualifiedCompletions,
  buildColumnCompletionsForDot,
  parseActiveStatement,
  extractTableAliases,
  extractTableReferences,
  normalizeQuotedIdentifier,
  type SchemaNamespace,
  type TableColumnFetcher,
} from "@/lib/query-sql-completion";

// ────────────────────────────────────────────────────────────
// Approved read-only keyword vocabulary
// ────────────────────────────────────────────────────────────

describe("APPROVED_KEYWORDS", () => {
  it("includes SELECT", () => {
    expect(APPROVED_KEYWORDS).toContain("SELECT");
  });

  it("includes SHOW", () => {
    expect(APPROVED_KEYWORDS).toContain("SHOW");
  });

  it("includes DESCRIBE", () => {
    expect(APPROVED_KEYWORDS).toContain("DESCRIBE");
  });

  it("includes DESC", () => {
    expect(APPROVED_KEYWORDS).toContain("DESC");
  });

  it("includes EXPLAIN", () => {
    expect(APPROVED_KEYWORDS).toContain("EXPLAIN");
  });

  it("includes read-only clauses: FROM, JOIN, ON, WHERE, GROUP BY, HAVING, ORDER BY, LIMIT, OFFSET, WITH, AS, UNION, INTERSECT, EXCEPT", () => {
    for (const kw of [
      "FROM", "JOIN", "ON", "WHERE", "GROUP BY", "HAVING",
      "ORDER BY", "LIMIT", "OFFSET", "WITH", "AS",
      "UNION", "INTERSECT", "EXCEPT",
    ]) {
      expect(APPROVED_KEYWORDS).toContain(kw);
    }
  });

  it("includes safe built-in functions like COUNT, SUM, AVG, MIN, MAX, COALESCE, IF, IFNULL, CONCAT", () => {
    for (const fn of ["COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "IF", "IFNULL", "CONCAT"]) {
      expect(APPROVED_KEYWORDS).toContain(fn);
    }
  });
});

// ────────────────────────────────────────────────────────────
// Forbidden keywords must never appear in suggestions
// ────────────────────────────────────────────────────────────

describe("FORBIDDEN_KEYWORDS", () => {
  it("includes write keywords: INSERT, UPDATE, DELETE", () => {
    expect(FORBIDDEN_KEYWORDS).toContain("INSERT");
    expect(FORBIDDEN_KEYWORDS).toContain("UPDATE");
    expect(FORBIDDEN_KEYWORDS).toContain("DELETE");
  });

  it("includes DDL keywords: CREATE, ALTER, DROP, TRUNCATE", () => {
    expect(FORBIDDEN_KEYWORDS).toContain("CREATE");
    expect(FORBIDDEN_KEYWORDS).toContain("ALTER");
    expect(FORBIDDEN_KEYWORDS).toContain("DROP");
    expect(FORBIDDEN_KEYWORDS).toContain("TRUNCATE");
  });

  it("includes session keywords: CALL, SET, USE, GRANT", () => {
    expect(FORBIDDEN_KEYWORDS).toContain("CALL");
    expect(FORBIDDEN_KEYWORDS).toContain("SET");
    expect(FORBIDDEN_KEYWORDS).toContain("USE");
    expect(FORBIDDEN_KEYWORDS).toContain("GRANT");
  });

  it("includes transaction keywords: BEGIN, COMMIT, ROLLBACK", () => {
    expect(FORBIDDEN_KEYWORDS).toContain("BEGIN");
    expect(FORBIDDEN_KEYWORDS).toContain("COMMIT");
    expect(FORBIDDEN_KEYWORDS).toContain("ROLLBACK");
  });

  it("includes locking keywords: LOCK, UNLOCK", () => {
    expect(FORBIDDEN_KEYWORDS).toContain("LOCK");
    expect(FORBIDDEN_KEYWORDS).toContain("UNLOCK");
  });

  it("no forbidden keyword appears in APPROVED_KEYWORDS", () => {
    for (const kw of FORBIDDEN_KEYWORDS) {
      expect(APPROVED_KEYWORDS).not.toContain(kw);
    }
  });
});

// ────────────────────────────────────────────────────────────
// buildKeywordCompletions
// ────────────────────────────────────────────────────────────

describe("buildKeywordCompletions", () => {
  it("returns completions for each approved keyword", () => {
    const completions = buildKeywordCompletions();
    expect(completions.length).toBe(APPROVED_KEYWORDS.length);
  });

  it("each completion has label and type keyword", () => {
    const completions = buildKeywordCompletions();
    for (const c of completions) {
      expect(c).toHaveProperty("label");
      expect(c).toHaveProperty("type", "keyword");
    }
  });

  it("never includes forbidden keywords", () => {
    const completions = buildKeywordCompletions();
    const labels = completions.map((c) => c.label);
    for (const kw of FORBIDDEN_KEYWORDS) {
      expect(labels).not.toContain(kw);
    }
  });
});

// ────────────────────────────────────────────────────────────
// buildTableCompletions — tables/views in active database
// ────────────────────────────────────────────────────────────

describe("buildTableCompletions", () => {
  it("returns completions for tables and views", () => {
    const ns: SchemaNamespace = {
      tables: [
        { name: "users", kind: "table" },
        { name: "active_users_view", kind: "view" },
      ],
    };
    const completions = buildTableCompletions(ns);
    expect(completions).toHaveLength(2);
  });

  it("table completions have type table", () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "orders", kind: "table" }],
    };
    const completions = buildTableCompletions(ns);
    expect(completions[0]).toMatchObject({ label: "orders", type: "table" });
  });

  it("view completions have type view", () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "v_sales", kind: "view" }],
    };
    const completions = buildTableCompletions(ns);
    expect(completions[0]).toMatchObject({ label: "v_sales", type: "view" });
  });

  it("returns empty array for empty namespace", () => {
    const completions = buildTableCompletions({ tables: [] });
    expect(completions).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// buildDatabaseQualifiedCompletions
// ────────────────────────────────────────────────────────────

describe("buildDatabaseQualifiedCompletions", () => {
  it("returns database.table completions", () => {
    const ns: SchemaNamespace = {
      databases: ["mydb", "analytics"],
      tables: [{ name: "users", kind: "table" }],
    };
    const completions = buildDatabaseQualifiedCompletions(ns);
    const labels = completions.map((c) => c.label);
    expect(labels).toContain("mydb");
    expect(labels).toContain("analytics");
  });

  it("database completions have type database", () => {
    const ns: SchemaNamespace = {
      databases: ["mydb"],
      tables: [],
    };
    const completions = buildDatabaseQualifiedCompletions(ns);
    expect(completions[0]).toMatchObject({ label: "mydb", type: "database" });
  });

  it("returns empty when no databases", () => {
    const completions = buildDatabaseQualifiedCompletions({ tables: [] });
    expect(completions).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// buildColumnCompletionsForDot — table./alias. column resolution
// ────────────────────────────────────────────────────────────

describe("buildColumnCompletionsForDot", () => {
  const fetcher: TableColumnFetcher = vi.fn();

  beforeEach(() => {
    vi.mocked(fetcher).mockReset();
  });

  it("returns columns from loaded metadata when table is in namespace", async () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "users", kind: "table" }],
      loadedColumns: {
        users: ["id", "name", "email"],
      },
    };
    const result = await buildColumnCompletionsForDot("users", ns, fetcher);
    const labels = result.map((c) => c.label);
    expect(labels).toEqual(["id", "name", "email"]);
    // Should NOT call the fetcher since columns are already loaded
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls fetcher for unknown table and returns fetched columns", async () => {
    const ns: SchemaNamespace = {
      tables: [],
      loadedColumns: {},
    };
    vi.mocked(fetcher).mockResolvedValueOnce(["col_a", "col_b"]);
    const result = await buildColumnCompletionsForDot("unknown_table", ns, fetcher);
    expect(fetcher).toHaveBeenCalledWith("unknown_table");
    const labels = result.map((c) => c.label);
    expect(labels).toEqual(["col_a", "col_b"]);
  });

  it("returns empty array when fetcher returns empty", async () => {
    const ns: SchemaNamespace = { tables: [], loadedColumns: {} };
    vi.mocked(fetcher).mockResolvedValueOnce([]);
    const result = await buildColumnCompletionsForDot("ghost", ns, fetcher);
    expect(result).toHaveLength(0);
  });

  it("returns column completions with type property", async () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "t", kind: "table" }],
      loadedColumns: { t: ["a"] },
    };
    const result = await buildColumnCompletionsForDot("t", ns, fetcher);
    expect(result[0]).toMatchObject({ label: "a", type: "field" });
  });

  it("resolves alias to its table name and returns those columns", async () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "users", kind: "table" }],
      loadedColumns: { users: ["id", "name"] },
    };
    const result = await buildColumnCompletionsForDot("u", ns, fetcher, { u: "users" });
    const labels = result.map((c) => c.label);
    expect(labels).toEqual(["id", "name"]);
  });
});

// ────────────────────────────────────────────────────────────
// parseActiveStatement — conservative statement boundary parser
// ────────────────────────────────────────────────────────────

describe("parseActiveStatement", () => {
  it("returns the full text for a single statement", () => {
    const result = parseActiveStatement("SELECT * FROM users", 5);
    expect(result).toBe("SELECT * FROM users");
  });

  it("returns the statement containing the cursor for multi-statement input", () => {
    const text = "SELECT 1;\nSELECT * FROM orders;\nSELECT 2;";
    // Cursor at position inside "SELECT * FROM orders"
    const secondStmtStart = text.indexOf("SELECT * FROM orders");
    const result = parseActiveStatement(text, secondStmtStart + 5);
    expect(result).toBe("SELECT * FROM orders");
  });

  it("returns empty string for empty input", () => {
    expect(parseActiveStatement("", 0)).toBe("");
  });

  it("handles cursor at statement boundary", () => {
    const text = "SELECT 1;\nSELECT 2";
    const result = parseActiveStatement(text, text.length);
    expect(result).toBe("SELECT 2");
  });
});

// ────────────────────────────────────────────────────────────
// extractTableAliases — alias detection within a single statement
// ────────────────────────────────────────────────────────────

describe("extractTableAliases", () => {
  it("extracts simple alias: FROM users u", () => {
    const aliases = extractTableAliases("SELECT * FROM users u");
    expect(aliases).toEqual({ u: "users" });
  });

  it("extracts AS alias: FROM users AS u", () => {
    const aliases = extractTableAliases("SELECT * FROM users AS u");
    expect(aliases).toEqual({ u: "users" });
  });

  it("extracts multiple aliases from JOINs", () => {
    const sql = "SELECT * FROM users u JOIN orders o ON u.id = o.user_id";
    const aliases = extractTableAliases(sql);
    expect(aliases).toEqual({ u: "users", o: "orders" });
  });

  it("returns empty for no aliases", () => {
    const aliases = extractTableAliases("SELECT * FROM users");
    expect(aliases).toEqual({});
  });

  it("handles backtick-quoted table names", () => {
    const aliases = extractTableAliases("SELECT * FROM `my table` t");
    expect(aliases).toEqual({ t: "my table" });
  });
});

// ────────────────────────────────────────────────────────────
// extractTableReferences — tables referenced in active statement
// ────────────────────────────────────────────────────────────

describe("extractTableReferences", () => {
  it("extracts table from FROM clause", () => {
    const refs = extractTableReferences("SELECT * FROM users");
    expect(refs).toContain("users");
  });

  it("extracts tables from FROM and JOIN", () => {
    const refs = extractTableReferences("SELECT * FROM users u JOIN orders o ON u.id = o.user_id");
    expect(refs).toContain("users");
    expect(refs).toContain("orders");
  });

  it("extracts subquery alias as reference", () => {
    const refs = extractTableReferences("SELECT * FROM (SELECT 1) sub");
    // Subquery aliases should not be treated as real table references
    // for column fetching purposes
    expect(refs).not.toContain("sub");
  });

  it("returns empty for no table references", () => {
    const refs = extractTableReferences("SELECT 1");
    expect(refs).toEqual([]);
  });

  it("handles backtick-quoted table names", () => {
    const refs = extractTableReferences("SELECT * FROM `my-database`.`my-table`");
    expect(refs).toContain("my-table");
  });
});

// ────────────────────────────────────────────────────────────
// Alias boundaries do not cross statements
// ────────────────────────────────────────────────────────────

describe("alias isolation across statements", () => {
  it("aliases from one statement do not leak into another", () => {
    const stmt1 = "SELECT * FROM users u";
    const stmt2 = "SELECT * FROM orders o";

    const aliases1 = extractTableAliases(stmt1);
    const aliases2 = extractTableAliases(stmt2);

    expect(aliases1).toEqual({ u: "users" });
    expect(aliases2).toEqual({ o: "orders" });
    expect(aliases2).not.toHaveProperty("u");
  });
});

// ────────────────────────────────────────────────────────────
// normalizeQuotedIdentifier — backtick wrapping
// ────────────────────────────────────────────────────────────

describe("normalizeQuotedIdentifier", () => {
  it("wraps identifier in backticks", () => {
    expect(normalizeQuotedIdentifier("users")).toBe("`users`");
  });

  it("does not double-wrap already backticked identifier", () => {
    expect(normalizeQuotedIdentifier("`users`")).toBe("`users`");
  });

  it("wraps identifier with special characters", () => {
    expect(normalizeQuotedIdentifier("my table")).toBe("`my table`");
  });

  it("wraps reserved word identifiers", () => {
    expect(normalizeQuotedIdentifier("order")).toBe("`order`");
  });
});

// ────────────────────────────────────────────────────────────
// Concurrent detail fetch cap
// ────────────────────────────────────────────────────────────

describe("concurrent detail fetch cap", () => {
  it("caps concurrent column fetches at five", async () => {
    let activeCount = 0;
    let maxActive = 0;

    const slowFetcher: TableColumnFetcher = async () => {
      activeCount++;
      maxActive = Math.max(maxActive, activeCount);
      await new Promise((r) => setTimeout(r, 10));
      activeCount--;
      return ["col"];
    };

    const ns: SchemaNamespace = { tables: [], loadedColumns: {} };

    // Fire 10 concurrent fetches
    const promises = Array.from({ length: 10 }, (_, i) =>
      buildColumnCompletionsForDot(`table_${i}`, ns, slowFetcher),
    );

    await Promise.all(promises);
    expect(maxActive).toBeLessThanOrEqual(5);
  });
});

// ────────────────────────────────────────────────────────────
// Completion failure falls back to keywords/loaded metadata
// ────────────────────────────────────────────────────────────

describe("completion failure fallback", () => {
  it("returns keyword completions when fetcher throws", async () => {
    const failingFetcher: TableColumnFetcher = async () => {
      throw new Error("network error");
    };

    const ns: SchemaNamespace = { tables: [], loadedColumns: {} };
    // The function should not throw; it should return empty (graceful degradation)
    const result = await buildColumnCompletionsForDot("broken_table", ns, failingFetcher);
    expect(result).toEqual([]);
  });

  it("returns loaded columns even when fetcher fails for other tables", async () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "users", kind: "table" }],
      loadedColumns: { users: ["id"] },
    };
    const result = await buildColumnCompletionsForDot("users", ns, async () => {
      throw new Error("should not be called");
    });
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("id");
  });
});

// ────────────────────────────────────────────────────────────
// DSN/credential leak prevention
// ────────────────────────────────────────────────────────────

describe("credential leak prevention", () => {
  it("keyword completions never contain DSN fragments", () => {
    const completions = buildKeywordCompletions();
    const labels = completions.map((c) => c.label).join(" ");
    expect(labels).not.toMatch(/password/i);
    expect(labels).not.toMatch(/dsn/i);
    expect(labels).not.toMatch(/credential/i);
    expect(labels).not.toMatch(/secret/i);
    expect(labels).not.toMatch(/mysql:\/\//i);
  });

  it("table completions never contain credential references", () => {
    const ns: SchemaNamespace = {
      tables: [{ name: "users", kind: "table" }],
    };
    const completions = buildTableCompletions(ns);
    const labels = completions.map((c) => c.label).join(" ");
    expect(labels).not.toMatch(/password/i);
    expect(labels).not.toMatch(/dsn/i);
  });
});
