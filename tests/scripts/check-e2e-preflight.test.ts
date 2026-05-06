import { describe, expect, it } from "vitest";
import {
  parseLsofOutput,
  formatPortWarning,
  shouldFailPreflight,
} from "../../scripts/check-e2e-preflight.mjs";

describe("parseLsofOutput", () => {
  it("returns empty array for empty string", () => {
    expect(parseLsofOutput("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseLsofOutput("   ")).toEqual([]);
  });

  it("parses a single listener line", () => {
    const output = "node    12345 user  ...  TCP *:3100 (LISTEN)";
    const result = parseLsofOutput(output);
    expect(result).toEqual([{ command: "node", pid: "12345" }]);
  });

  it("parses multiple listener lines", () => {
    const output = [
      "node    111 user  ...  TCP *:3100 (LISTEN)",
      "node    222 user  ...  TCP *:8081 (LISTEN)",
    ].join("\n");
    const result = parseLsofOutput(output);
    expect(result).toEqual([
      { command: "node", pid: "111" },
      { command: "node", pid: "222" },
    ]);
  });
});

describe("formatPortWarning", () => {
  it("reports port as free with no listeners", () => {
    const result = formatPortWarning(3100, []);
    expect(result).toContain(":3100");
    expect(result).toContain("free");
  });

  it("includes PID and command for listeners", () => {
    const listeners = [{ command: "node", pid: "12345" }];
    const result = formatPortWarning(3100, listeners);
    expect(result).toContain("PID 12345");
    expect(result).toContain("node");
    expect(result).toContain("Stale processes");
  });
});

describe("shouldFailPreflight", () => {
  it("does not fail in non-strict mode even with listeners", () => {
    expect(
      shouldFailPreflight({
        strict: false,
        listeners: [{ command: "node", pid: "12345", port: 3100 }],
      }),
    ).toBe(false);
  });

  it("fails in strict mode when listeners exist", () => {
    expect(
      shouldFailPreflight({
        strict: true,
        listeners: [{ command: "node", pid: "12345", port: 3100 }],
      }),
    ).toBe(true);
  });

  it("does not fail in strict mode when no listeners exist", () => {
    expect(shouldFailPreflight({ strict: true, listeners: [] })).toBe(false);
  });
});
