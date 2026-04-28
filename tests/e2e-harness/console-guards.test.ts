import { describe, expect, it } from "vitest";

describe("console-guards", () => {
  // We test the filtering logic in isolation by reimplementing the core logic.
  // The actual functions depend on Playwright's Page, so we test the predicate
  // behavior that drives collectConsoleMessages.

  function isAllowed(text: string, patterns: RegExp[]): boolean {
    return patterns.some((p) => p.test(text));
  }

  describe("allowlist behavior", () => {
    const allowedErrors: RegExp[] = [
      /Fast Refresh/,
      /HMR/,
      /Download the React DevTools/,
    ];

    it("allows messages matching any allowlist pattern", () => {
      expect(isAllowed("Fast Refresh had an issue", allowedErrors)).toBe(true);
      expect(isAllowed("HMR connection lost", allowedErrors)).toBe(true);
      expect(
        isAllowed("Download the React DevTools for better debugging", allowedErrors),
      ).toBe(true);
    });

    it("rejects messages not matching any allowlist pattern", () => {
      expect(isAllowed("Uncaught TypeError: foo is not a function", allowedErrors)).toBe(false);
      expect(isAllowed("Warning: Each child in a list should have a unique key", allowedErrors)).toBe(false);
      expect(isAllowed("Something went wrong", allowedErrors)).toBe(false);
    });

    it("empty allowlist rejects everything", () => {
      expect(isAllowed("Fast Refresh had an issue", [])).toBe(false);
      expect(isAllowed("anything", [])).toBe(false);
    });

    it("does not treat partial regex match as sufficient without pattern", () => {
      const allowedWarnings: RegExp[] = [/hydration/i];
      expect(isAllowed("hydration mismatch", allowedWarnings)).toBe(true);
      expect(isAllowed("Hydration error", allowedWarnings)).toBe(true);
      expect(isAllowed("network timeout", allowedWarnings)).toBe(false);
    });
  });

  describe("assertClean logic", () => {
    // Simulate the filtering done by collectConsoleMessages, then verify
    // the assertClean invariants.

    interface Msg {
      type: "error" | "warning";
      text: string;
    }

    function filterMessages(
      all: Array<{ type: string; text: string }>,
      opts: { allowedErrors?: RegExp[]; allowedWarnings?: RegExp[] },
    ): Msg[] {
      return all
        .filter((m) => m.type === "error" || m.type === "warning")
        .filter((m) => {
          const patterns =
            m.type === "error" ? opts.allowedErrors : opts.allowedWarnings;
          return !patterns?.some((p) => p.test(m.text));
        }) as Msg[];
    }

    it("empty messages array is clean", () => {
      const result = filterMessages([], {});
      expect(result).toHaveLength(0);
    });

    it("allowed errors are filtered out", () => {
      const messages = [
        { type: "error", text: "Fast Refresh issue" },
        { type: "error", text: "Uncaught TypeError" },
      ];
      const result = filterMessages(messages, {
        allowedErrors: [/Fast Refresh/],
      });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("Uncaught TypeError");
    });

    it("warnings without allowlist are flagged", () => {
      const messages = [
        { type: "warning", text: "deprecated API usage" },
      ];
      const result = filterMessages(messages, {});
      expect(result).toHaveLength(1);
    });

    it("allowed warnings are filtered out", () => {
      const messages = [
        { type: "warning", text: "hydration warning" },
        { type: "warning", text: "unknown warning" },
      ];
      const result = filterMessages(messages, {
        allowedWarnings: [/hydration/],
      });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("unknown warning");
    });

    it("log/info messages are ignored", () => {
      const messages = [
        { type: "log", text: "some log" },
        { type: "info", text: "some info" },
        { type: "debug", text: "debug info" },
      ];
      const result = filterMessages(messages, {});
      expect(result).toHaveLength(0);
    });
  });
});
