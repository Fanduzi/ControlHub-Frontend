const MAX_JSON_FORMAT_LENGTH = 16_384;
const MAX_JSON_FORMAT_DEPTH = 32;

export function formatResultJson(text: string): string | null {
  if (text.length > MAX_JSON_FORMAT_LENGTH || !/^[\x20\t\r\n]*[\[{]/.test(text)) return null;
  try {
    JSON.parse(text);
  } catch {
    return null;
  }

  // Indent tokens rather than stringifying parsed values: keep number lexemes,
  // duplicate keys, key order, and string escapes exactly as delivered.
  const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|[{}\[\],:]|[^\s{}\[\],:"]+/g) ?? [];
  const lines: string[] = [];
  let depth = 0;
  const indent = () => "\n" + "  ".repeat(depth);
  for (const [index, token] of tokens.entries()) {
    switch (token) {
      case "{":
      case "[":
        if (++depth > MAX_JSON_FORMAT_DEPTH) return null;
        lines.push(token);
        if (tokens[index + 1] !== (token === "{" ? "}" : "]")) lines.push(indent());
        break;
      case "}":
      case "]":
        depth--;
        if (tokens[index - 1] !== (token === "}" ? "{" : "[")) lines.push(indent());
        lines.push(token);
        break;
      case ",":
        lines.push(token, indent());
        break;
      case ":":
        lines.push(": ");
        break;
      default:
        lines.push(token);
    }
  }
  return lines.join("");
}
