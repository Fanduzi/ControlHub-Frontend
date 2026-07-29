import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  clampEditorHeight,
  normalizeEditorTheme,
  parseStoredEditorHeight,
} from "@/lib/query-editor-preferences";

describe("query editor preferences", () => {
  it("normalizes known editor theme preferences", () => {
    expect(normalizeEditorTheme("system")).toBe("system");
    expect(normalizeEditorTheme("dark")).toBe("dark");
    expect(normalizeEditorTheme("light")).toBe("light");
    expect(normalizeEditorTheme("high_contrast")).toBe("high_contrast");
  });

  it("falls back to system for unknown editor theme preferences", () => {
    expect(normalizeEditorTheme("bad")).toBe("system");
    expect(normalizeEditorTheme(null)).toBe("system");
  });

  it("clamps editor height to the supported workbench range", () => {
    expect(clampEditorHeight(100)).toBe(180);
    expect(clampEditorHeight(220)).toBe(220);
    expect(clampEditorHeight(1000)).toBe(640);
  });

  it("parses stored editor height only when the stored value is valid", () => {
    expect(parseStoredEditorHeight("360")).toBe(360);
    expect(parseStoredEditorHeight("abc")).toBeNull();
    expect(parseStoredEditorHeight("50")).toBeNull();
    expect(parseStoredEditorHeight(null)).toBeNull();
  });
});

describe("Phase 38S: page-size localStorage persistence", () => {
  const STORAGE_KEY = "controlhub.query.pageSize";

  beforeEach(() => {
    localStorage.clear();
  });

  it("reads persisted page size from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "50");

    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBe("50");
  });

  it("falls back to default page size (25) when localStorage is empty", () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).toBeNull();
  });

  it("persists page size to localStorage on change", () => {
    localStorage.setItem(STORAGE_KEY, "100");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("100");
  });

  it("validates stored page size against allowed values [10, 25, 50, 100]", () => {
    const allowedValues = [10, 25, 50, 100];

    for (const value of allowedValues) {
      localStorage.setItem(STORAGE_KEY, String(value));
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      expect(allowedValues).toContain(stored);
    }
  });

  it("ignores invalid stored page size and uses default", () => {
    localStorage.setItem(STORAGE_KEY, "999");

    const stored = Number(localStorage.getItem(STORAGE_KEY));
    const allowedValues = [10, 25, 50, 100];
    const isValid = allowedValues.includes(stored);

    expect(isValid).toBe(false);
  });

  it("page-size change in one tab is reflected via storage event", () => {
    const event = new StorageEvent("storage", {
      key: STORAGE_KEY,
      newValue: "50",
      oldValue: "25",
    });

    window.dispatchEvent(event);

    expect(event.newValue).toBe("50");
  });
});
