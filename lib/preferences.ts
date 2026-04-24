export const ACCENT_STORAGE_KEY = "controlhub.accent";
export const ACCENTS = ["blue", "purple", "emerald", "amber"] as const;
export const DEFAULT_ACCENT = "blue";

export type AccentName = (typeof ACCENTS)[number];

export function isAccentName(value: string): value is AccentName {
  return ACCENTS.includes(value as AccentName);
}

export function readStoredAccent() {
  if (typeof window === "undefined") {
    return DEFAULT_ACCENT;
  }

  const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
  return value && isAccentName(value) ? value : DEFAULT_ACCENT;
}

export function applyAccentToDocument(accent: AccentName) {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.accent = accent;
}

/* ─── Environment context preference ─── */

export const ENVIRONMENT_STORAGE_KEY = "controlhub.environmentId";

/** Null = "all environments" (no filter). */
export function readStoredEnvironmentId(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.localStorage.getItem(ENVIRONMENT_STORAGE_KEY);
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function persistEnvironmentId(id: number | null): void {
  if (typeof window === "undefined") {
    return;
  }

  if (id !== null) {
    window.localStorage.setItem(ENVIRONMENT_STORAGE_KEY, String(id));
  } else {
    window.localStorage.removeItem(ENVIRONMENT_STORAGE_KEY);
  }
}
