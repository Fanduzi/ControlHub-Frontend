export const QUERY_EDITOR_HEIGHT_STORAGE_KEY = "controlhub.query.editor.height";
export const QUERY_EDITOR_THEME_STORAGE_KEY = "controlhub.query.editor.theme";
export const MIN_QUERY_EDITOR_HEIGHT = 180;
export const MAX_QUERY_EDITOR_HEIGHT = 640;
export const DEFAULT_QUERY_EDITOR_HEIGHT = 260;

export type QueryEditorThemePreference =
  | "system"
  | "light"
  | "dark"
  | "high_contrast";

export function normalizeEditorTheme(
  value: unknown,
): QueryEditorThemePreference {
  switch (value) {
    case "system":
    case "light":
    case "dark":
    case "high_contrast":
      return value;
    default:
      return "system";
  }
}

export function clampEditorHeight(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUERY_EDITOR_HEIGHT;
  }
  return Math.min(
    MAX_QUERY_EDITOR_HEIGHT,
    Math.max(MIN_QUERY_EDITOR_HEIGHT, Math.round(value)),
  );
}

export function parseStoredEditorHeight(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (parsed < MIN_QUERY_EDITOR_HEIGHT || parsed > MAX_QUERY_EDITOR_HEIGHT) {
    return null;
  }

  return Math.round(parsed);
}

export const QUERY_RESULT_PAGE_SIZE_STORAGE_KEY = "controlhub.query.result-page-size";
export const QUERY_RESULT_PAGE_SIZES = [10, 25, 50, 100] as const;

const DEFAULT_PAGE_SIZE = QUERY_RESULT_PAGE_SIZES[0];
const VALID_PAGE_SIZES = new Set<number>(QUERY_RESULT_PAGE_SIZES);

export function getPageSize(): number {
  try {
    if (typeof window === "undefined") {
      return DEFAULT_PAGE_SIZE;
    }

    const stored = localStorage.getItem(QUERY_RESULT_PAGE_SIZE_STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (VALID_PAGE_SIZES.has(parsed)) {
        return parsed;
      }
    }
  } catch {
    // no-excuse-ok: catch — localStorage failures use the safe default.
  }
  return DEFAULT_PAGE_SIZE;
}

export function setPageSize(value: number): void {
  if (!VALID_PAGE_SIZES.has(value)) return;
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(QUERY_RESULT_PAGE_SIZE_STORAGE_KEY, String(value));
  } catch {
    // no-excuse-ok: catch — localStorage failures must not block execution.
  }
}
