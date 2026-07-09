import { describe, expect, it } from "vitest";

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
