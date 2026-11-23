/**
 * Scope-aware SQL completion parser for MySQL and PostgreSQL worksheets.
 *
 * Reads the CodeMirror lang-sql Lezer tree to resolve, for the cursor's
 * innermost query block only: FROM/JOIN source bindings (catalog tables,
 * CTEs, derived tables), earlier WITH declarations, and whether the cursor
 * sits in relation position. This is a UX layer only — no wildcard
 * expansion, no correlated-alias or cross-statement inference, and the
 * backend guard stays the authoritative execution boundary.
 */

import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

import type { IdentifierDialect } from "@/lib/query-identifiers";

type Binding =
  | { kind: "catalog"; table: string }
  | { kind: "local"; columns: readonly string[] };

type Token = { node: SyntaxNode; text: string };

type Scope = {
  bindings: ReadonlyMap<string, Binding>;
  ctes: ReadonlyMap<string, readonly string[]>;
  relationPosition: boolean;
};

const namePattern = /^[A-Za-z_][\w$]*$/;
const clauseEnd =
  /^(WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|FETCH|FOR|WINDOW|INTO|UNION|INTERSECT|EXCEPT)$/;
const compound = /^(UNION|EXCEPT|INTERSECT)$/;
const ignored = new Set(["(", ")", ";", "LineComment", "BlockComment"]);
const opaque = new Set(["String", "LineComment", "BlockComment"]);
const identifierNodes = new Set(["Identifier", "Keyword", "Builtin", "Type"]);
const syntaxWords =
  /^(SELECT|WITH|RECURSIVE|AS|FROM|JOIN|LEFT|RIGHT|FULL|INNER|OUTER|CROSS|NATURAL|STRAIGHT_JOIN|ON|USING|WHERE|GROUP|HAVING|ORDER|LIMIT|OFFSET|FETCH|FOR|WINDOW|INTO|UNION|INTERSECT|EXCEPT|VALUES|TABLE|DISTINCT|DISTINCTROW|ALL|IS|NOT|AND|OR|NULL|TRUE|FALSE|DEFAULT|CURRENT_DATE|CURRENT_TIME|CURRENT_TIMESTAMP|CURRENT_USER|SESSION_USER|SYSTEM_USER|USER|LOCALTIME|LOCALTIMESTAMP|COLLATE|LATERAL|ONLY|TABLESAMPLE|USE|FORCE|IGNORE|INDEX|KEY)$/i;

const MAX_SCOPE_DOC_LENGTH = 32_768;
const MAX_QUERY_DEPTH = 16;

function kw(t: Token | undefined) {
  return t?.node.name === "Keyword" ? t.text.toUpperCase() : "";
}

/** Unquote a raw token text into its comparable identifier name. */
function sqlScopeName(text: string, dialect: IdentifierDialect): string {
  const q = dialect === "postgresql" ? '"' : "`";
  return text.startsWith(q) && text.endsWith(q)
    ? text.slice(1, -1).replaceAll(q + q, q)
    : dialect === "postgresql"
      ? text.toLowerCase()
      : text;
}

function children(node: SyntaxNode, state: EditorState): Token[] {
  const tokens: Token[] = [];
  for (let n = node.firstChild; n; n = n.nextSibling)
    if (!ignored.has(n.name))
      tokens.push({ node: n, text: state.sliceDoc(n.from, n.to) });
  return tokens;
}

// lang-sql lexes some valid identifier texts as Keyword/Builtin/Type
// (PostgreSQL `id`/`name`, MySQL `status`, `text` in both) — node kind is a
// hint only; reserved syntax words still refuse identifier slots.
function name(
  t: Token | undefined,
  dialect: IdentifierDialect,
): string | undefined {
  if (!t) return undefined;
  if (t.node.name === "QuotedIdentifier") {
    // Only a complete quoted token can bind a source/name slot; a partially
    // typed quoted identifier never produces a name.
    const valid =
      dialect === "postgresql"
        ? /^"(?:[^"]|"")*"$/.test(t.text)
        : /^`(?:[^`]|``)*`$/.test(t.text);
    return valid ? sqlScopeName(t.text, dialect) : undefined;
  }
  if (!identifierNodes.has(t.node.name) || !namePattern.test(t.text)) {
    return undefined;
  }
  if (t.node.name !== "Identifier" && syntaxWords.test(t.text)) {
    return undefined;
  }
  return sqlScopeName(t.text, dialect);
}

function path(
  t: Token,
  state: EditorState,
  dialect: IdentifierDialect,
): string[] {
  const fields =
    t.node.name === "CompositeIdentifier"
      ? children(t.node, state).filter((x) => x.node.name !== ".")
      : [t];
  const names = fields.map((f) => name(f, dialect));
  return names.every((n): n is string => !!n && !n.includes(".")) ? names : [];
}

/** A Parens whose first real token opens a SELECT or WITH query. */
function isQueryParens(node: SyntaxNode, state: EditorState): boolean {
  if (node.name !== "Parens") return false;
  const first = kw(children(node, state)[0]);
  return first === "SELECT" || first === "WITH";
}

/**
 * Names offered as output columns must each resolve uniquely: an exact
 * (PostgreSQL) or case-insensitive (MySQL) duplicate is ambiguous and dropped
 * entirely, preserving the order of the survivors.
 */
function unambiguousColumns(
  names: readonly string[],
  dialect: IdentifierDialect,
): readonly string[] {
  const key = (name: string) =>
    dialect === "mysql" ? name.toLowerCase() : name;
  const seen = new Set<string>();
  const ambiguous = new Set<string>();
  for (const name of names) {
    const id = key(name);
    if (seen.has(id)) ambiguous.add(id);
    seen.add(id);
  }
  return names.filter((name) => !ambiguous.has(key(name)));
}

/** tokens[index] is the FROM of `IS [NOT] DISTINCT FROM`, not a clause. */
function isDistinctFrom(tokens: Token[], index: number): boolean {
  return (
    kw(tokens[index]) === "FROM" &&
    kw(tokens[index - 1]) === "DISTINCT" &&
    (kw(tokens[index - 2]) === "IS" ||
      (kw(tokens[index - 2]) === "NOT" && kw(tokens[index - 3]) === "IS"))
  );
}

/**
 * Explicit CTE column list `name(c1, c2)`: only valid names interleaved with
 * commas. Returns null when the shape deviates so the caller can record an
 * empty (still shadowing) projection.
 */
function columnList(
  parens: SyntaxNode,
  state: EditorState,
  dialect: IdentifierDialect,
): readonly string[] | null {
  const tokens = children(parens, state);
  const out: string[] = [];
  let expectName = true;
  for (const t of tokens) {
    if (expectName) {
      const n = name(t, dialect);
      if (n === undefined) return null;
      out.push(n);
      expectName = false;
    } else if (t.node.name === "Punctuation" && t.text === ",") {
      expectName = true;
    } else {
      return null;
    }
  }
  return expectName ? null : unambiguousColumns(out, dialect);
}

/**
 * Output column names a SELECT or WITH..SELECT group yields. Uses the group's
 * direct children only: projection items are split at top-level commas after
 * SELECT (DISTINCT/ALL skipped) until FROM or a clause end. A single simple
 * identifier or a validated qualified path yields its last name; a non-empty
 * expression followed by `AS <identifier>` yields the explicit alias; `*`,
 * `a.*`, implicit expression aliases and anything else infer nothing. A
 * top-level set operation yields no projection.
 */
function projection(
  group: SyntaxNode,
  state: EditorState,
  dialect: IdentifierDialect,
): readonly string[] {
  const tokens = children(group, state);
  let i = 0;
  if (kw(tokens[0]) === "WITH") {
    // Index-only pass: locating the main SELECT must not recursively
    // compute projections of unrelated deep CTEs.
    const w = scanWith(tokens, state, dialect, null, false);
    if (!w) return [];
    i = w.index;
  }
  if (kw(tokens[i]) !== "SELECT") return [];
  if (tokens.some((t) => compound.test(kw(t)))) return [];
  i++;
  while (kw(tokens[i]) === "DISTINCT" || kw(tokens[i]) === "ALL") i++;
  const items: Token[][] = [[]];
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    const k = kw(t);
    if (clauseEnd.test(k) || (k === "FROM" && !isDistinctFrom(tokens, i)))
      break;
    if (t.node.name === "Punctuation" && t.text === ",") {
      items.push([]);
      continue;
    }
    items[items.length - 1]!.push(t);
  }
  const out: string[] = [];
  const push = (n: string | undefined) => {
    if (n !== undefined) out.push(n);
  };
  for (const item of items) {
    if (item.length === 0) continue;
    if (item.length === 1) {
      const p = path(item[0]!, state, dialect);
      if (p.length > 0) push(p[p.length - 1]);
      continue;
    }
    if (item.length >= 3 && kw(item[item.length - 2]) === "AS") {
      push(name(item[item.length - 1], dialect));
    }
  }
  return unambiguousColumns(out, dialect);
}

/**
 * Parse `WITH` declarations starting at tokens[0] === WITH. Each declaration
 * is `name [Parens explicit column list] AS Parens(query)`, declarations
 * separated by commas. When `descendTo` (the chain node the cursor descends
 * into) lies inside a declaration's body, that declaration and every later
 * one is dropped and `descended` is set so the caller skips this group's own
 * main-SELECT check. Returns null on RECURSIVE or malformed declarations.
 */
function scanWith(
  tokens: Token[],
  state: EditorState,
  dialect: IdentifierDialect,
  descendTo: SyntaxNode | null,
  collectColumns = true,
): {
  decls: [string, readonly string[]][];
  index: number;
  descended: boolean;
} | null {
  let i = 1;
  if (kw(tokens[i]) === "RECURSIVE") return null;
  const decls: [string, readonly string[]][] = [];
  const names = new Set<string>();
  for (;;) {
    const cteName = name(tokens[i], dialect);
    // A duplicate CTE name in one WITH is refused, never last-wins.
    if (cteName === undefined || names.has(cteName)) return null;
    names.add(cteName);
    i++;
    let explicit: readonly string[] | null = null;
    if (tokens[i]?.node.name === "Parens") {
      explicit = columnList(tokens[i]!.node, state, dialect) ?? [];
      i++;
    }
    if (kw(tokens[i]) !== "AS") return null;
    i++;
    const body = tokens[i];
    if (!body || body.node.name !== "Parens") return null;
    i++;
    if (
      descendTo &&
      descendTo.from >= body.node.from &&
      descendTo.to <= body.node.to
    ) {
      return { decls, index: i, descended: true };
    }
    if (!isQueryParens(body.node, state)) return null;
    if (collectColumns) {
      decls.push([
        cteName,
        explicit ?? projection(body.node, state, dialect),
      ]);
    }
    if (tokens[i]?.node.name === "Punctuation" && tokens[i]!.text === ",") {
      i++;
      continue;
    }
    return { decls, index: i, descended: false };
  }
}

/**
 * Optional `[AS] name` alias directly after a relation source token. Under
 * PostgreSQL a Parens immediately after the alias is the explicit output
 * column list (`AS d(renamed)`): when present it is consumed and returned as
 * `columns` — callers must bind only those names and never infer the tail.
 */
function readAlias(
  tokens: Token[],
  i: number,
  dialect: IdentifierDialect,
  state: EditorState,
): {
  alias: string | undefined;
  next: number;
  columns?: readonly string[];
} {
  let aliasTok: Token | undefined;
  let next: number;
  if (kw(tokens[i]) === "AS") {
    aliasTok = tokens[i + 1];
    next = i + 2;
  } else {
    aliasTok = tokens[i];
    next = i + 1;
  }
  const alias = name(aliasTok, dialect);
  if (alias === undefined) return { alias: undefined, next: i };
  let columns: readonly string[] | undefined;
  if (dialect === "postgresql" && tokens[next]?.node.name === "Parens") {
    columns = columnList(tokens[next]!.node, state, dialect) ?? [];
    next += 1;
  }
  return { alias, next, columns };
}

type CompletionSite = {
  scope: Scope | null;
  column?: { qualifier: string; from: number; to: number; quoted: boolean };
};

/**
 * Classify the completion site at `pos`: either a `qualifier.` column slot
 * (with the whole field's replacement range so mid-identifier and quoted
 * partials replace cleanly) or the plain vocabulary site with its scope.
 * Returns null inside strings/comments, inside a bare quoted identifier, on
 * chained qualifiers (`a.b.c`), and on any other shape that must stay silent.
 */
export function sqlCompletionSite(
  state: EditorState,
  pos: number,
  wordFrom: number,
  dialect: IdentifierDialect,
): CompletionSite | null {
  if (state.doc.length > MAX_SCOPE_DOC_LENGTH) return null;
  const tree = ensureSyntaxTree(state, state.doc.length, 40);
  if (!tree || tree.length !== state.doc.length) return null;
  let leaf = tree.resolveInner(pos, -1);
  // Whitespace after the last token may sit outside the Statement node.
  if (leaf.name === "Script") {
    const previous = state.sliceDoc(0, pos).trimEnd().length;
    if (previous !== pos) leaf = tree.resolveInner(previous, -1);
  }
  if (opaque.has(leaf.name) && pos <= leaf.to) return null;
  if (leaf.name === ";") return { scope: null };
  const composite =
    leaf.name === "CompositeIdentifier"
      ? leaf
      : leaf.parent?.name === "CompositeIdentifier"
        ? leaf.parent
        : null;
  if (composite) {
    const parts = children(composite, state);
    const dot = parts.findIndex(
      (t) => t.node.name === "." && t.node.to <= pos,
    );
    if (dot >= 0) {
      // Only a single qualified name, with the caret in its column slot.
      const qualifier = name(parts[0], dialect);
      if (!qualifier || dot !== 1 || parts.length > 3) return null;
      const field = parts[2];
      const missing =
        !field ||
        (field.node.type.isError && field.node.from === field.node.to);
      const quoted = field?.node.name === "QuotedIdentifier";
      if (
        !missing &&
        (!field ||
          pos > field.node.to ||
          (!quoted && !name(field, dialect)))
      )
        return null;
      const from = missing ? pos : Math.min(pos, field!.node.from);
      const to = missing ? pos : field!.node.to;
      const scope = resolveScope(state, leaf, composite.from, dialect);
      if (!scope || scope.relationPosition) return null;
      return { scope, column: { qualifier, from, to, quoted } };
    }
  }
  // Unqualified quoted identifiers don't use the plain keyword menu.
  if (
    leaf.name === "QuotedIdentifier" &&
    leaf.from < pos &&
    pos <= leaf.to
  )
    return null;
  return { scope: resolveScope(state, leaf, wordFrom, dialect) };
}

/**
 * Resolve the innermost query scope for `leaf`: FROM/JOIN source bindings
 * for the group containing the cursor, WITH declarations inherited from
 * that group and every enclosing query, and whether the cursor is in
 * relation position (the last real token before `wordFrom` is FROM or JOIN,
 * or a comma while scanning a FROM clause). Returns null when the cursor is
 * not inside a usable query — a non-SELECT group, a RECURSIVE or compound
 * query, or a malformed statement — so callers never fall back to guessing.
 */
function resolveScope(
  state: EditorState,
  leaf: SyntaxNode,
  wordFrom: number,
  dialect: IdentifierDialect,
): Scope | null {
  const groups: SyntaxNode[] = [];
  for (let n: SyntaxNode | null = leaf; n; n = n.parent) {
    if (n.name === "Statement" || isQueryParens(n, state)) groups.push(n);
  }
  groups.reverse();
  if (groups.length === 0 || groups.length > MAX_QUERY_DEPTH) return null;

  const ctes = new Map<string, readonly string[]>();
  const bindings = new Map<string, Binding>();
  let relationPosition = false;

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi]!;
    const innermost = gi === groups.length - 1;
    const descendTo = innermost ? null : groups[gi + 1]!;
    const tokens = children(group, state);
    let i = 0;
    let descended = false;
    if (kw(tokens[0]) === "WITH") {
      const w = scanWith(tokens, state, dialect, descendTo);
      if (!w) return null;
      for (const [cteName, cols] of w.decls) ctes.set(cteName, cols);
      i = w.index;
      descended = w.descended;
    }
    if (!descended && kw(tokens[i]) !== "SELECT") return null;
    if (!innermost) continue;
    if (tokens.some((t) => compound.test(kw(t)))) return null;

    // Relation position = the FROM/JOIN trigger or FROM-clause comma that is
    // the last real token before the word being completed.
    let lastIndex = -1;
    for (let j = 0; j < tokens.length; j++) {
      if (tokens[j]!.node.from >= wordFrom) break;
      lastIndex = j;
    }
    let inFrom = false;
    let expectSource = false;
    const bind = (key: string | undefined, binding: Binding) => {
      if (key === undefined || key === "") return;
      bindings.set(
        key,
        bindings.has(key) ? { kind: "local", columns: [] } : binding,
      );
    };
    for (let j = i + 1; j < tokens.length; j++) {
      const t = tokens[j]!;
      const k = kw(t);
      if (clauseEnd.test(k)) break;
      if (
        (k === "FROM" && !inFrom && !isDistinctFrom(tokens, j)) ||
        (k === "JOIN" && inFrom)
      ) {
        inFrom = true;
        expectSource = true;
        if (j === lastIndex) relationPosition = true;
        continue;
      }
      if (k === "ONLY" || k === "LATERAL") continue;
      if (t.node.name === "Punctuation") {
        if (inFrom && t.text === ",") {
          expectSource = true;
          if (j === lastIndex) relationPosition = true;
        }
        continue;
      }
      if (!inFrom || !expectSource) continue;
      expectSource = false;
      if (t.node.name === "Parens") {
        const { alias, next, columns } = readAlias(
          tokens,
          j + 1,
          dialect,
          state,
        );
        j = next - 1;
        if (alias === undefined) continue;
        bind(
          alias,
          columns !== undefined
            ? { kind: "local", columns }
            : isQueryParens(t.node, state)
              ? {
                  kind: "local",
                  columns: projection(t.node, state, dialect),
                }
              : { kind: "local", columns: [] },
        );
        continue;
      }
      const p = path(t, state, dialect);
      if (p.length < 1 || p.length > 2) continue;
      let isCall = false;
      if (
        tokens[j + 1] &&
        tokens[j + 1]!.node.name === "Parens" &&
        !isQueryParens(tokens[j + 1]!.node, state)
      ) {
        isCall = true;
        j++;
      }
      const { alias, next, columns } = readAlias(
        tokens,
        j + 1,
        dialect,
        state,
      );
      // A malformed explicit `AS` must not fall back to the base name.
      if (kw(tokens[j + 1]) === "AS" && alias === undefined) continue;
      j = next - 1;
      if (isCall) {
        // Table/unknown function output is opaque: an alias must not acquire
        // catalog columns for an unrelated relation — only an explicit PG
        // alias column list may declare names.
        if (alias !== undefined) {
          bind(alias, { kind: "local", columns: columns ?? [] });
        }
        continue;
      }
      if (columns !== undefined && alias !== undefined) {
        bind(alias, { kind: "local", columns });
        continue;
      }
      const key = alias ?? p[p.length - 1];
      if (p.length === 1 && ctes.has(p[0]!)) {
        bind(key, { kind: "local", columns: ctes.get(p[0]!)! });
      } else {
        bind(key, { kind: "catalog", table: p.join(".") });
      }
    }
  }

  return { bindings, ctes, relationPosition };
}
