/**
 * Read-only SQL completion source for CodeMirror.
 *
 * Provides a governed vocabulary matching the backend SQL guard:
 * - Approved read-only keywords and safe built-in functions
 * - Schema-aware completions from loaded metadata
 * - Async column fetching with concurrency cap (5)
 * - Conservative statement-boundary parser (UX-only, not security boundary)
 *
 * This module is NOT a security boundary. The backend guard is authoritative.
 */

import type { Completion } from "@codemirror/autocomplete";

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/** Schema namespace fed into the completion system. */
export type SchemaNamespace = {
  readonly tables: ReadonlyArray<{ readonly name: string; readonly kind: "table" | "view" }>;
  readonly databases?: readonly string[];
  readonly loadedColumns?: Readonly<Record<string, readonly string[]>>;
};

/** Async column fetcher signature. */
export type TableColumnFetcher = (table: string) => Promise<readonly string[]>;

// ────────────────────────────────────────────────────────────
// Approved read-only vocabulary
// ────────────────────────────────────────────────────────────

/** Read-only SQL keywords approved for autocompletion. */
export const APPROVED_KEYWORDS: readonly string[] = [
  // Query commands
  "SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN",
  // Read-only clauses
  "FROM", "JOIN", "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "CROSS JOIN",
  "ON", "WHERE", "GROUP BY", "HAVING", "ORDER BY", "LIMIT", "OFFSET",
  "WITH", "AS", "UNION", "INTERSECT", "EXCEPT",
  // Additional read-only clauses
  "DISTINCT", "ALL", "BETWEEN", "IN", "LIKE", "IS", "NOT", "NULL",
  "AND", "OR", "CASE", "WHEN", "THEN", "ELSE", "END",
  "ASC", "DESC", "TOP", "INTO", "VALUES",
  // Safe built-in functions
  "COUNT", "SUM", "AVG", "MIN", "MAX",
  "COALESCE", "IF", "IFNULL", "CONCAT", "LENGTH", "UPPER", "LOWER",
  "TRIM", "LTRIM", "RTRIM", "SUBSTRING", "REPLACE",
  "NOW", "CURDATE", "CURTIME", "DATE", "YEAR", "MONTH", "DAY",
  "CAST", "CONVERT", "ROUND", "FLOOR", "CEIL", "ABS",
  "JSON_EXTRACT", "JSON_LENGTH", "JSON_CONTAINS",
  "GROUP_CONCAT", "DISTINCT",
];

/** Keywords forbidden from autocompletion (write/DDL/session/transaction/locking). */
export const FORBIDDEN_KEYWORDS: readonly string[] = [
  // Write
  "INSERT", "UPDATE", "DELETE",
  // DDL
  "CREATE", "ALTER", "DROP", "TRUNCATE",
  // Session
  "CALL", "SET", "USE", "GRANT",
  // Transaction
  "BEGIN", "COMMIT", "ROLLBACK",
  // Locking
  "LOCK", "UNLOCK",
];

// ────────────────────────────────────────────────────────────
// Completion builders
// ────────────────────────────────────────────────────────────

/** Build keyword completions from the approved vocabulary. */
export function buildKeywordCompletions(): Completion[] {
  return APPROVED_KEYWORDS.map((kw) => ({
    label: kw,
    type: "keyword",
  }));
}

/** Build table/view completions from schema namespace. */
export function buildTableCompletions(ns: SchemaNamespace): Completion[] {
  return ns.tables.map((t) => ({
    label: t.name,
    type: t.kind === "view" ? "view" : "table",
  }));
}

/** Build database-qualified completions. */
export function buildDatabaseQualifiedCompletions(ns: SchemaNamespace): Completion[] {
  if (!ns.databases || ns.databases.length === 0) {
    return [];
  }
  return ns.databases.map((db) => ({
    label: db,
    type: "database",
  }));
}

// ────────────────────────────────────────────────────────────
// Concurrency-limited column fetching
// ────────────────────────────────────────────────────────────

let activeFetchCount = 0;
const MAX_CONCURRENT_FETCHES = 5;

/**
 * Build column completions for a dot-triggered `table.` or `alias.` reference.
 *
 * If columns are already loaded in the namespace, returns them immediately.
 * Otherwise calls the fetcher with concurrency capped at 5.
 */
export async function buildColumnCompletionsForDot(
  prefix: string,
  ns: SchemaNamespace,
  fetcher: TableColumnFetcher,
  aliases?: Readonly<Record<string, string>>,
): Promise<readonly Completion[]> {
  // Resolve alias → real table name
  const tableName = aliases?.[prefix] ?? prefix;

  // Check loaded metadata first
  const loaded = ns.loadedColumns?.[tableName];
  if (loaded) {
    return loaded.map((col) => ({ label: col, type: "field" }));
  }

  // Check if table exists in namespace (no fetch needed if not a known table)
  const knownTable = ns.tables.some((t) => t.name === tableName);
  if (!knownTable) {
    // Try fetching anyway for alias-resolved names
    return fetchColumnsWithCap(tableName, fetcher);
  }

  return fetchColumnsWithCap(tableName, fetcher);
}

/**
 * Fetch columns with a concurrency cap of MAX_CONCURRENT_FETCHES.
 * Returns empty array on failure (graceful degradation).
 */
async function fetchColumnsWithCap(
  table: string,
  fetcher: TableColumnFetcher,
): Promise<readonly Completion[]> {
  if (activeFetchCount >= MAX_CONCURRENT_FETCHES) {
    return [];
  }

  activeFetchCount++;
  try {
    const columns = await fetcher(table);
    return columns.map((col) => ({ label: col, type: "field" }));
  } catch {
    // Graceful degradation — return empty, keywords/metadata still available
    return [];
  } finally {
    activeFetchCount--;
  }
}

// ────────────────────────────────────────────────────────────
// Statement parser (UX-only, not security boundary)
// ────────────────────────────────────────────────────────────

/**
 * Parse the active statement from multi-statement input.
 * Returns the statement containing the cursor position.
 * Conservative: splits on `;` boundaries only.
 */
export function parseActiveStatement(text: string, cursorPos: number): string {
  if (!text) return "";

  // Split on semicolons, tracking positions
  const statements: Array<{ start: number; end: number; text: string }> = [];
  let current = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === ";") {
      const stmt = text.slice(current, i).trim();
      if (stmt) {
        statements.push({ start: current, end: i, text: stmt });
      }
      current = i + 1;
    }
  }

  // Last statement (may not end with semicolon)
  const last = text.slice(current).trim();
  if (last) {
    statements.push({ start: current, end: text.length, text: last });
  }

  if (statements.length === 0) return "";

  // Find statement containing cursor
  for (const stmt of statements) {
    if (cursorPos >= stmt.start && cursorPos <= stmt.end) {
      return stmt.text;
    }
  }

  // Default to last statement
  return statements[statements.length - 1].text;
}

// ────────────────────────────────────────────────────────────
// Alias extraction
// ────────────────────────────────────────────────────────────

/**
 * Extract table aliases from a single SQL statement.
 * Handles: `FROM users u`, `FROM users AS u`, `JOIN orders o`.
 * Returns a map of alias → table name.
 */
export function extractTableAliases(
  statement: string,
): Record<string, string> {
  const aliases: Record<string, string> = {};

  // Match: (FROM|JOIN) [backtick-quoted or word] [AS] [alias]
  // This is a conservative UX parser, not a SQL parser.
  const pattern =
    /(?:FROM|JOIN)\s+(?:`([^`]+)`|(\w+))(?:\s+(?:AS\s+)?(\w+))?/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(statement)) !== null) {
    const tableName = match[1] ?? match[2]; // backtick-quoted or plain
    const alias = match[3];

    if (tableName && alias) {
      // Exclude common SQL keywords that might be误 captured as aliases
      const upperAlias = alias.toUpperCase();
      if (
        !["ON", "WHERE", "GROUP", "HAVING", "ORDER", "LIMIT", "OFFSET", "SET", "VALUES", "AS"].includes(
          upperAlias,
        )
      ) {
        aliases[alias] = tableName;
      }
    }
  }

  return aliases;
}

/**
 * Extract table references from a single SQL statement.
 * Returns table names (not aliases) from FROM and JOIN clauses.
 * Excludes subquery aliases. Handles `db.table` qualified references.
 */
export function extractTableReferences(statement: string): readonly string[] {
  const refs: string[] = [];
  const seen = new Set<string>();

  // Match: FROM/JOIN followed by a table reference which may be:
  // - `db`.`table` (backtick-quoted, database-qualified)
  // - `table` (backtick-quoted)
  // - db.table (plain, database-qualified)
  // - table (plain)
  const pattern =
    /(?:FROM|JOIN)\s+(?:`[^`]+`\.`([^`]+)`|`([^`]+)`|(\w+)\.(\w+)|(\w+))/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(statement)) !== null) {
    // Group 1: `db`.`table` → table name
    // Group 2: `table` → table name
    // Group 3+4: db.table → table is group 4
    // Group 5: plain table
    const tableName = match[1] ?? match[2] ?? match[4] ?? match[5];
    if (tableName && !seen.has(tableName)) {
      // Skip if preceded by opening paren (subquery)
      const before = statement.slice(Math.max(0, match.index - 1), match.index);
      if (before === "(") continue;

      seen.add(tableName);
      refs.push(tableName);
    }
  }

  return refs;
}

// ────────────────────────────────────────────────────────────
// Identifier quoting
// ────────────────────────────────────────────────────────────

/**
 * Wrap an identifier in backticks. Does not double-wrap.
 */
export function normalizeQuotedIdentifier(identifier: string): string {
  if (identifier.startsWith("`") && identifier.endsWith("`")) {
    return identifier;
  }
  return `\`${identifier}\``;
}
