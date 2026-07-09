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
