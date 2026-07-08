import { describe, expect, it } from "vitest";
import { formatQueryStatement, formatterLanguageForEngine } from "@/lib/query-sql-format";

describe("formatterLanguageForEngine", () => {
  it("maps mysql to mysql", () => {
    expect(formatterLanguageForEngine("mysql")).toBe("mysql");
  });

  it("maps tidb to mysql", () => {
    expect(formatterLanguageForEngine("tidb")).toBe("mysql");
  });

  it("maps unknown engines to sql", () => {
    expect(formatterLanguageForEngine("clickhouse")).toBe("sql");
  });

  it("maps empty string to sql", () => {
    expect(formatterLanguageForEngine("")).toBe("sql");
  });
});

describe("formatQueryStatement", () => {
  it("formats a simple select with mysql engine", () => {
    const result = formatQueryStatement("mysql", "select * from users where id=1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.formatted).toContain("SELECT");
      expect(result.formatted).toContain("FROM");
      expect(result.formatted).toContain("users");
    }
  });

  it("returns unchanged for empty statement", () => {
    const result = formatQueryStatement("mysql", "");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.formatted).toBe("");
    }
  });

  it("returns unchanged for whitespace-only statement", () => {
    const result = formatQueryStatement("mysql", "   ");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.formatted).toBe("   ");
    }
  });

  it("uses mysql dialect for tidb engine", () => {
    const result = formatQueryStatement("tidb", "select 1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.formatted).toContain("SELECT");
    }
  });

  it("uses generic sql dialect for unknown engines", () => {
    const result = formatQueryStatement("clickhouse", "select 1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.formatted).toContain("SELECT");
    }
  });

  it("returns controlled error for invalid SQL", () => {
    // Use a mock that throws to test error handling
    const result = formatQueryStatement("mysql", "select {{invalid", (stmt, opts) => {
      throw new Error("Parse error");
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Parse error");
    }
  });
});
