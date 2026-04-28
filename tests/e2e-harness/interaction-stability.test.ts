import { describe, expect, it } from "vitest";

import {
  BLANK_CLICK_X,
  BLANK_CLICK_Y,
  DEFAULT_BLUE_PRIMARY,
  isDefaultBluePrimary,
  OVERLAY_SELECTORS,
} from "../../e2e/harness/interaction-stability";

describe("isDefaultBluePrimary", () => {
  it("returns true for the exact default blue primary color", () => {
    expect(isDefaultBluePrimary(DEFAULT_BLUE_PRIMARY)).toBe(true);
  });

  it("returns false for purple accent color", () => {
    expect(isDefaultBluePrimary("lab(29.6489% 38.3996 -25.3886)")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isDefaultBluePrimary("")).toBe(false);
  });

  it("returns false for a near-miss value", () => {
    // One digit changed
    expect(isDefaultBluePrimary("lab(45.2565% -10.9423 -37.8453)")).toBe(false);
  });
});

describe("blank click coordinates", () => {
  it("uses real mouse coordinates, not zero/center", () => {
    expect(BLANK_CLICK_X).toBeGreaterThan(0);
    expect(BLANK_CLICK_Y).toBeGreaterThan(0);
  });

  it("coordinates are in the top-left corner (safe for closing overlays)", () => {
    expect(BLANK_CLICK_X).toBeLessThan(50);
    expect(BLANK_CLICK_Y).toBeLessThan(50);
  });
});

describe("OVERLAY_SELECTORS", () => {
  it("contains exactly 3 selector entries", () => {
    expect(OVERLAY_SELECTORS).toHaveLength(3);
  });

  it("includes dialog role selector", () => {
    const dialog = OVERLAY_SELECTORS.find((s) => s.name === "dialog");
    expect(dialog).toBeDefined();
    expect(dialog!.selector).toBe('[role="dialog"]');
  });

  it("includes sheet-overlay selector", () => {
    const overlay = OVERLAY_SELECTORS.find((s) => s.name === "sheet-overlay");
    expect(overlay).toBeDefined();
    expect(overlay!.selector).toBe('[data-slot="sheet-overlay"]');
  });

  it("includes inert attribute selector", () => {
    const inert = OVERLAY_SELECTORS.find((s) => s.name === "inert");
    expect(inert).toBeDefined();
    expect(inert!.selector).toBe("[inert]");
  });
});
