import { describe, expect, it } from "vitest";

import {
  isAllowedConsoleMessage,
  type ConsoleGuardOptions,
} from "../../e2e/harness/console-guards";

describe("isAllowedConsoleMessage", () => {
  const opts: ConsoleGuardOptions = {
    allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
    allowedWarnings: [/hydration/],
  };

  it("allows error matching an allowlist pattern", () => {
    expect(isAllowedConsoleMessage("error", "Fast Refresh had an issue", opts)).toBe(true);
    expect(isAllowedConsoleMessage("error", "HMR connection lost", opts)).toBe(true);
    expect(isAllowedConsoleMessage("error", "Download the React DevTools for better DX", opts)).toBe(true);
  });

  it("rejects error not matching any allowlist pattern", () => {
    expect(isAllowedConsoleMessage("error", "Uncaught TypeError: foo is not a function", opts)).toBe(false);
    expect(isAllowedConsoleMessage("error", "Something went wrong", opts)).toBe(false);
  });

  it("allows warning matching an allowlist pattern", () => {
    expect(isAllowedConsoleMessage("warning", "hydration mismatch detected", opts)).toBe(true);
    expect(isAllowedConsoleMessage("warning", "hydration error in component", opts)).toBe(true);
  });

  it("rejects warning not matching any allowlist pattern", () => {
    expect(isAllowedConsoleMessage("warning", "deprecated API usage", opts)).toBe(false);
    expect(isAllowedConsoleMessage("warning", "network timeout", opts)).toBe(false);
  });

  it("returns false when no allowlist is provided", () => {
    const noList: ConsoleGuardOptions = {};
    expect(isAllowedConsoleMessage("error", "Fast Refresh", noList)).toBe(false);
    expect(isAllowedConsoleMessage("warning", "hydration", noList)).toBe(false);
  });

  it("returns false when allowlist is empty array", () => {
    const emptyList: ConsoleGuardOptions = { allowedErrors: [], allowedWarnings: [] };
    expect(isAllowedConsoleMessage("error", "anything", emptyList)).toBe(false);
    expect(isAllowedConsoleMessage("warning", "anything", emptyList)).toBe(false);
  });

  it("does not cross-contaminate error and warning allowlists", () => {
    // "Fast Refresh" is in allowedErrors, not allowedWarnings
    expect(isAllowedConsoleMessage("warning", "Fast Refresh issue", opts)).toBe(false);
    // "hydration" is in allowedWarnings, not allowedErrors
    expect(isAllowedConsoleMessage("error", "hydration mismatch", opts)).toBe(false);
  });

  it("case-sensitive: capital H does not match /hydration/", () => {
    expect(isAllowedConsoleMessage("warning", "Hydration mismatch", opts)).toBe(false);
  });

  it("case-insensitive flag matches both cases", () => {
    const ciOpts: ConsoleGuardOptions = { allowedWarnings: [/hydration/i] };
    expect(isAllowedConsoleMessage("warning", "hydration mismatch", ciOpts)).toBe(true);
    expect(isAllowedConsoleMessage("warning", "Hydration mismatch", ciOpts)).toBe(true);
  });

  it("REGRESSION: unexpected 403 console error must NOT be suppressed by default", () => {
    // The query-workbench.spec.ts had /Failed to load resource:.*403/ in allowedErrors,
    // which would suppress ANY 403 console error - hiding real API regressions.
    // This test proves that a 403 error is NOT allowed when using the standard allowlist.
    const standardOpts: ConsoleGuardOptions = {
      allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
      allowedWarnings: [/was preloaded using link preload but not used/],
    };
    // A 403 resource failure should be caught, not suppressed
    expect(isAllowedConsoleMessage("error", "Failed to load resource: the server responded with a status of 403 (Forbidden)", standardOpts)).toBe(false);
    // A schema API 403 should also be caught
    expect(isAllowedConsoleMessage("error", "Failed to load resource: http://localhost:8080/query-targets/616/schema/databases?page=1&pageSize=50 → 403", standardOpts)).toBe(false);
  });
});
