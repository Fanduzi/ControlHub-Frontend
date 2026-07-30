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

export const QUERY_MAX_ROWS_STORAGE_KEY = "controlhub.query.max-rows";
export const DEFAULT_QUERY_MAX_ROWS = 100;
// Mirrors the backend guard's HardMaxRows; larger values would be clamped
// server-side anyway, so they are not worth persisting.
const MAX_QUERY_MAX_ROWS = 500;

function isValidMaxRows(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_QUERY_MAX_ROWS;
}

// Narrow normalizer: worksheet state and Run requests must only ever carry a
// finite integer in 1..500, so invalid edits fall back instead of propagating.
export function normalizeMaxRows(
  value: unknown,
  fallback: number = DEFAULT_QUERY_MAX_ROWS,
): number {
  if (typeof value === "number" && isValidMaxRows(value)) {
    return value;
  }
  if (isValidMaxRows(fallback)) {
    return fallback;
  }
  return DEFAULT_QUERY_MAX_ROWS;
}

export function getMaxRows(): number {
  try {
    if (typeof window === "undefined") {
      return DEFAULT_QUERY_MAX_ROWS;
    }

    const stored = localStorage.getItem(QUERY_MAX_ROWS_STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number(stored);
      if (isValidMaxRows(parsed)) {
        return parsed;
      }
    }
  } catch {
    // no-excuse-ok: catch — localStorage failures use the safe default.
  }
  return DEFAULT_QUERY_MAX_ROWS;
}

export function setMaxRows(value: number): void {
  if (!isValidMaxRows(value)) return;
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(QUERY_MAX_ROWS_STORAGE_KEY, String(value));
  } catch {
    // no-excuse-ok: catch — localStorage failures must not block execution.
  }
}
