import { describe, expect, it } from "vitest";

import {
  isAllowedConsoleMessage,
  parseNetworkErrorMessage,
  takeExpectedConsoleStatusError,
  takeExpectedNetworkError,
  type ConsoleGuardOptions,
  type ConsoleMessage,
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
    expect(isAllowedConsoleMessage("warning", "Fast Refresh issue", opts)).toBe(false);
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
    const standardOpts: ConsoleGuardOptions = {
      allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
      allowedWarnings: [/was preloaded using link preload but not used/],
    };
    expect(
      isAllowedConsoleMessage(
        "error",
        "Failed to load resource: the server responded with a status of 403 (Forbidden)",
        standardOpts,
      ),
    ).toBe(false);
    expect(
      isAllowedConsoleMessage(
        "error",
        "Failed to load resource: http://localhost:8080/query-targets/616/schema/databases?page=1&pageSize=50 → 403",
        standardOpts,
      ),
    ).toBe(false);
  });

  it("REGRESSION: status of 500 must NOT be suppressed by default", () => {
    const standardOpts: ConsoleGuardOptions = {
      allowedErrors: [/Fast Refresh/, /HMR/, /Download the React DevTools/],
    };
    expect(
      isAllowedConsoleMessage(
        "error",
        "Failed to load resource: the server responded with a status of 500 ()",
        standardOpts,
      ),
    ).toBe(false);
  });
});

describe("takeExpectedNetworkError (one-shot exact match)", () => {
  const execute400 =
    "POST http://localhost:8081/query-targets/42/execute → 400";
  const execute400Other =
    "POST http://localhost:8081/query-targets/42/execute → 400";
  const schema403 =
    "GET http://localhost:8081/query-targets/42/schema/databases → 403";
  const server500 =
    "GET http://localhost:8081/query-targets → 500";
  const connectionRefused =
    "GET http://localhost:8081/query-targets → ERR_CONNECTION_REFUSED";

  it("consumes exactly one matching intentional execute 400", () => {
    const remaining = takeExpectedNetworkError([execute400], {
      method: "POST",
      urlIncludes: "/execute",
      status: 400,
    });
    expect(remaining).toEqual([]);
  });

  it("REGRESSION: intentional execute 400 cannot conceal a second 400", () => {
    const remaining = takeExpectedNetworkError([execute400, execute400Other], {
      method: "POST",
      urlIncludes: "/execute",
      status: 400,
    });
    // One remains — assertClean must still fail
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toContain("→ 400");
  });

  it("REGRESSION: intentional execute 400 cannot conceal an unrelated 403", () => {
    const remaining = takeExpectedNetworkError([execute400, schema403], {
      method: "POST",
      urlIncludes: "/execute",
      status: 400,
    });
    expect(remaining).toEqual([schema403]);
  });

  it("REGRESSION: intentional execute 400 cannot conceal a 500", () => {
    const remaining = takeExpectedNetworkError([execute400, server500], {
      method: "POST",
      urlIncludes: "/execute",
      status: 400,
    });
    expect(remaining).toEqual([server500]);
  });

  it("REGRESSION: intentional execute 400 cannot conceal ERR_CONNECTION_REFUSED", () => {
    const remaining = takeExpectedNetworkError([execute400, connectionRefused], {
      method: "POST",
      urlIncludes: "/execute",
      status: 400,
    });
    expect(remaining).toEqual([connectionRefused]);
  });

  it("does not match a different method or path", () => {
    expect(() =>
      takeExpectedNetworkError([schema403], {
        method: "POST",
        urlIncludes: "/execute",
        status: 400,
      }),
    ).toThrow(/Expected exactly one network error/);
  });

  it("does not match a different status on the same path", () => {
    expect(() =>
      takeExpectedNetworkError(
        ["POST http://localhost:8081/query-targets/42/execute → 500"],
        { method: "POST", urlIncludes: "/execute", status: 400 },
      ),
    ).toThrow(/Expected exactly one network error/);
  });

  it("throws when the expected error is absent", () => {
    expect(() =>
      takeExpectedNetworkError([], {
        method: "POST",
        urlIncludes: "/execute",
        status: 400,
      }),
    ).toThrow(/none matched/);
  });
});

describe("takeExpectedConsoleStatusError", () => {
  it("consumes one console status echo and leaves others", () => {
    const messages: ConsoleMessage[] = [
      { type: "error", text: "Failed to load resource: the server responded with a status of 400 ()" },
      { type: "error", text: "Failed to load resource: the server responded with a status of 403 ()" },
      { type: "error", text: "Uncaught TypeError: boom" },
    ];
    const remaining = takeExpectedConsoleStatusError(messages, 400);
    expect(remaining).toHaveLength(2);
    expect(remaining.some((m) => m.text.includes("403"))).toBe(true);
    expect(remaining.some((m) => m.text.includes("TypeError"))).toBe(true);
  });

  it("REGRESSION: consuming one 400 does not hide a second 400 console error", () => {
    const messages: ConsoleMessage[] = [
      { type: "error", text: "Failed to load resource: the server responded with a status of 400 ()" },
      { type: "error", text: "Failed to load resource: the server responded with a status of 400 ()" },
    ];
    const remaining = takeExpectedConsoleStatusError(messages, 400);
    expect(remaining).toHaveLength(1);
  });

  it("returns messages unchanged when no status echo exists", () => {
    const messages: ConsoleMessage[] = [
      { type: "error", text: "Uncaught TypeError: boom" },
    ];
    expect(takeExpectedConsoleStatusError(messages, 400)).toEqual(messages);
  });
});

describe("parseNetworkErrorMessage", () => {
  it("parses HTTP status errors", () => {
    expect(parseNetworkErrorMessage("POST http://x/execute → 400")).toEqual({
      method: "POST",
      url: "http://x/execute",
      status: 400,
    });
  });

  it("parses connection failures", () => {
    expect(
      parseNetworkErrorMessage("GET http://x/query-targets → ERR_CONNECTION_REFUSED"),
    ).toEqual({
      method: "GET",
      url: "http://x/query-targets",
      failure: "ERR_CONNECTION_REFUSED",
    });
  });
});
