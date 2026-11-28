import { describe, expect, it, vi } from "vitest";
import { canDownloadWorksheetSql, readWorksheetSqlFile, workspaceSnapshotFits } from "@/lib/worksheet-sql-file";
import { WorksheetSession } from "@/lib/worksheet-session";

function pick(bytes: Uint8Array, name = "draft.sql", size = bytes.byteLength) {
  return { name, size, arrayBuffer: vi.fn(async () => bytes.slice().buffer) };
}

const utf8 = new TextEncoder();

describe("worksheet .sql file", () => {
  it("loads UTF-8 with an optional BOM as plain text, without using the filename", async () => {
    const sql = "-- 本地草稿 <strong>文字</strong>\r\nSELECT 1;";
    expect(await readWorksheetSqlFile(pick(utf8.encode(`\uFEFF${sql}`), "draft.SQL"))).toEqual({
      statement: "-- 本地草稿 <strong>文字</strong>\nSELECT 1;",
    });
  });

  it.each([0, 16385])("rejects a %d-byte file before reading it", async (size) => {
    const file = pick(utf8.encode("SELECT 1;"), "draft.sql", size);
    expect(await readWorksheetSqlFile(file)).toMatchObject({ error: size ? "size" : "text" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });

  it("uses the file suffix as a usability check, not as proof of safe text", async () => {
    const file = pick(utf8.encode("SELECT 1;"), "draft.txt");
    expect(await readWorksheetSqlFile(file)).toEqual({ error: "type" });
    expect(file.arrayBuffer).not.toHaveBeenCalled();
    expect(await readWorksheetSqlFile(pick(Uint8Array.of(0xc3, 0x28)))).toEqual({ error: "text" });
  });

  it.each([" \n\t", "SELECT\u00001;", "SELECT '\u202e'", "SELECT '\u001b'", "SELECT '\u200b'"])("rejects blank and control-laden content", async (sql) => {
    expect(await readWorksheetSqlFile(pick(utf8.encode(sql)))).toEqual({ error: "text" });
  });

  it("accepts exactly 16 KiB and fails closed on a file read error", async () => {
    const sql = "--" + "x".repeat(16382);
    expect(await readWorksheetSqlFile(pick(utf8.encode(sql)))).toEqual({ statement: sql });
    const file = pick(utf8.encode("SELECT 1;"));
    file.arrayBuffer.mockRejectedValueOnce(new Error("disk"));
    expect(await readWorksheetSqlFile(file)).toEqual({ error: "read" });
  });
});

describe("downloadable worksheet SQL", () => {
  it("accepts exact UTF-8 text at the import limit and rejects text that cannot round-trip", async () => {
    const sql = "-- " + "界".repeat(5460) + "\n;";
    expect(utf8.encode(sql)).toHaveLength(16385);
    const fits = sql.slice(1);
    expect(canDownloadWorksheetSql(fits)).toBe(true);
    expect(await readWorksheetSqlFile(pick(utf8.encode(fits), "worksheet.sql"))).toEqual({ statement: fits });
    for (const invalid of [sql, "\t\n ", "SELECT 1;\r\n", "-- \u200b\nSELECT 1;", "-- \ud800\nSELECT 1;"]) {
      expect(canDownloadWorksheetSql(invalid)).toBe(false);
    }
  });
});

it("reserves the actual server JSON byte budget, including Go's HTML-safe character escapes", () => {
  const worksheet = { id: "draft", name: "Worksheet", targetResourceId: 1, activeDatabase: null, activeSchema: null };
  const existing = Array.from({ length: 3 }, (_, i) => ({ ...worksheet, id: String(i), statement: "<>&".repeat(5461) }));
  expect(workspaceSnapshotFits(existing)).toBe(false);
  expect(workspaceSnapshotFits(existing.slice(0, 2))).toBe(true);
  const session = new WorksheetSession({ initialTargetId: 1, engineFor: () => "postgresql" });
  session.hydrate(existing.slice(0, 2), 1);
  const before = session.persistedSnapshot();
  expect(session.restoreDraft({ targetId: 1, activeDatabase: "labdb", statement: existing[2]!.statement }, { enforceWorkspaceBudget: true })).toBeNull();
  expect(session.persistedSnapshot()).toEqual(before);
  expect(session.activeId).toBe("0");
  const draft = session.restoreDraft({ targetId: 1, activeDatabase: "labdb", activeSchema: "analytics", statement: "SELECT 1;" }, { enforceWorkspaceBudget: true });
  expect(draft).toMatchObject({ activeDatabase: "labdb", activeSchema: "analytics", result: null, isExecuting: false });
});
