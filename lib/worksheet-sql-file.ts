import type { QueryWorkspaceWorksheet } from "@/types/query-workspace";

// Match backend MaxSavedStatementSize and MaxQueryWorkspaceJSONSize.
const MAX_SQL_DRAFT_BYTES = 16 * 1024;
const MAX_WORKSPACE_BYTES = 256 * 1024;
const utf8 = new TextEncoder();

export type SqlFileError = "type" | "size" | "text" | "read";

function isSqlFileText(text: string): boolean {
  // Reject invisible formatting and non-text code points, but keep editor whitespace.
  return !!text.trim() && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\p{Cf}\p{Cs}\u2028\u2029]/u.test(text);
}

export function canDownloadWorksheetSql(text: string): boolean {
  return text.length <= MAX_SQL_DRAFT_BYTES && !text.includes("\r") && isSqlFileText(text) &&
    utf8.encode(text).length <= MAX_SQL_DRAFT_BYTES;
}

export async function readWorksheetSqlFile(file: Pick<File, "name" | "size" | "arrayBuffer">): Promise<
  { statement: string } | { error: SqlFileError }
> {
  if (!/\.sql$/i.test(file.name)) return { error: "type" };
  if (file.size > MAX_SQL_DRAFT_BYTES) return { error: "size" };
  if (file.size === 0) return { error: "text" };
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { error: "read" };
  }
  if (bytes.byteLength > MAX_SQL_DRAFT_BYTES) return { error: "size" };
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!isSqlFileText(text)) return { error: "text" };
    return { statement: text.replace(/\r\n?/g, "\n") };
  } catch {
    return { error: "text" };
  }
}

export function workspaceSnapshotFits(worksheets: readonly QueryWorkspaceWorksheet[]): boolean {
  if (worksheets.some(({ statement }) => statement.length > MAX_SQL_DRAFT_BYTES || utf8.encode(statement).length > MAX_SQL_DRAFT_BYTES)) return false;
  // Go's JSON encoder escapes HTML-sensitive characters and Unicode line separators.
  const json = JSON.stringify(worksheets).replace(/[<>&\u2028\u2029]/g, "\\u0000");
  return utf8.encode(json).length <= MAX_WORKSPACE_BYTES;
}
