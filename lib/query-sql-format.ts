import { format, type FormatOptionsWithLanguage } from "sql-formatter";

type FormatImpl = (
  statement: string,
  options: FormatOptionsWithLanguage,
) => string;

export function formatterLanguageForEngine(engine: string): string {
  const normalized = engine.trim().toLowerCase();
  if (normalized === "mysql" || normalized === "tidb") {
    return "mysql";
  }
  return "sql";
}

export function formatQueryStatement(
  engine: string,
  statement: string,
  formatImpl: FormatImpl = format,
): { ok: true; formatted: string } | { ok: false; error: string } {
  if (statement.trim() === "") {
    return { ok: true, formatted: statement };
  }

  try {
    const formatted = formatImpl(statement, {
      language: formatterLanguageForEngine(engine) as FormatOptionsWithLanguage["language"],
      keywordCase: "upper",
      tabWidth: 2,
      linesBetweenQueries: 1,
    });
    return { ok: true, formatted };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to format SQL",
    };
  }
}
