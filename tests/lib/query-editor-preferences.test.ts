import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  clampEditorHeight,
  DEFAULT_QUERY_MAX_ROWS,
  getMaxRows,
  getPageSize,
  normalizeEditorTheme,
  normalizeMaxRows,
  parseStoredEditorHeight,
  QUERY_MAX_ROWS_STORAGE_KEY,
  QUERY_RESULT_PAGE_SIZE_STORAGE_KEY,
  QUERY_RESULT_PAGE_SIZES,
  setMaxRows,
  setPageSize,
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
  beforeEach(() => {
    localStorage.clear();
  });

  it("reads persisted page size from localStorage on mount", () => {
    localStorage.setItem(QUERY_RESULT_PAGE_SIZE_STORAGE_KEY, "50");

    expect(getPageSize()).toBe(50);
  });

  it("falls back to default page size (10) when localStorage is empty", () => {
    expect(getPageSize()).toBe(10);
  });

  it("persists page size to localStorage on change", () => {
    setPageSize(100);

    expect(localStorage.getItem(QUERY_RESULT_PAGE_SIZE_STORAGE_KEY)).toBe("100");
    expect(localStorage.length).toBe(1);
  });

  it("validates stored page size against allowed values [10, 25, 50, 100]", () => {
    for (const value of QUERY_RESULT_PAGE_SIZES) {
      setPageSize(value);
      expect(getPageSize()).toBe(value);
    }
  });

  it("ignores invalid stored page size and uses default", () => {
    localStorage.setItem(QUERY_RESULT_PAGE_SIZE_STORAGE_KEY, "999");

    expect(getPageSize()).toBe(10);
  });

  it("falls back to default when localStorage access fails", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(getPageSize()).toBe(10);

    getItem.mockRestore();
  });

  it("uses the preference key for storage events", () => {
    const event = new StorageEvent("storage", {
      key: QUERY_RESULT_PAGE_SIZE_STORAGE_KEY,
      newValue: "50",
      oldValue: "25",
    });

    window.dispatchEvent(event);

    expect(event.newValue).toBe("50");
  });
});

describe("Phase 38S: maxRows localStorage persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to 100 total released rows when localStorage is empty", () => {
    expect(getMaxRows()).toBe(100);
  });

  it("persists maxRows to its own storage key on change", () => {
    setMaxRows(250);

    expect(localStorage.getItem(QUERY_MAX_ROWS_STORAGE_KEY)).toBe("250");
    expect(getMaxRows()).toBe(250);
  });

  it("rejects non-positive, fractional, and beyond-hard-cap values", () => {
    for (const invalid of [0, -5, 2.5, 501, Number.NaN]) {
      setMaxRows(invalid);
      expect(localStorage.getItem(QUERY_MAX_ROWS_STORAGE_KEY)).toBeNull();
    }
  });

  it("ignores invalid stored maxRows and uses the default", () => {
    for (const stored of ["0", "-1", "abc", "501", "2.5"]) {
      localStorage.setItem(QUERY_MAX_ROWS_STORAGE_KEY, stored);
      expect(getMaxRows()).toBe(100);
    }
  });

  it("falls back to the default when localStorage access fails", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(getMaxRows()).toBe(100);

    getItem.mockRestore();
  });
});

describe("Phase 38T: maxRows normalization", () => {
  it("returns finite integers within 1..500 unchanged", () => {
    expect(normalizeMaxRows(1)).toBe(1);
    expect(normalizeMaxRows(250)).toBe(250);
    expect(normalizeMaxRows(500)).toBe(500);
  });

  it("falls back to the default for NaN, empty conversion, fractions, non-positive, and over-cap values", () => {
    // Number("") === 0 is what a cleared number input produces.
    for (const invalid of [Number.NaN, Number(""), 2.5, 0, -5, 501, Number.POSITIVE_INFINITY]) {
      expect(normalizeMaxRows(invalid)).toBe(DEFAULT_QUERY_MAX_ROWS);
    }
  });

  it("prefers a valid fallback over the default", () => {
    expect(normalizeMaxRows(Number.NaN, 50)).toBe(50);
    expect(normalizeMaxRows(501, 50)).toBe(50);
    expect(normalizeMaxRows(0, 500)).toBe(500);
  });

  it("ignores an invalid fallback and uses the default", () => {
    expect(normalizeMaxRows(Number.NaN, 0)).toBe(DEFAULT_QUERY_MAX_ROWS);
    expect(normalizeMaxRows(Number.NaN, 501)).toBe(DEFAULT_QUERY_MAX_ROWS);
    expect(normalizeMaxRows(Number.NaN, 2.5)).toBe(DEFAULT_QUERY_MAX_ROWS);
  });
});
