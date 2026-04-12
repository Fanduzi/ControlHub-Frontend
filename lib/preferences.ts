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
