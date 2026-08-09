// input: @/lib/operator-session/origin
// output: Vitest tests for the Console BFF same-origin guard on unsafe methods
// pos: unit-level contract tests for Console Origin enforcement at the BFF boundary
// note: if this file changes, update header and tests/lib/README.md
import { describe, expect, it } from "vitest";

import { isUnsafeMethod, originAllowed } from "@/lib/operator-session/origin";

const CONSOLE_ORIGIN = "http://localhost:3100";

function requestWith(origin: string | null, method = "POST"): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request(`http://localhost:3100/api/operator-session`, {
    method,
    headers,
  });
}

describe("originAllowed", () => {
  it("allows the exact configured Console Origin", () => {
    expect(originAllowed(requestWith(CONSOLE_ORIGIN), CONSOLE_ORIGIN)).toBe(
      true,
    );
  });

  it("rejects a different origin", () => {
    expect(
      originAllowed(requestWith("https://evil.example"), CONSOLE_ORIGIN),
    ).toBe(false);
  });

  it("rejects a missing Origin header", () => {
    expect(originAllowed(requestWith(null), CONSOLE_ORIGIN)).toBe(false);
  });

  it("rejects a same-host different-port origin", () => {
    expect(
      originAllowed(requestWith("http://localhost:9999"), CONSOLE_ORIGIN),
    ).toBe(false);
  });

  it("rejects an origin with a trailing slash when the configured origin has none", () => {
    expect(
      originAllowed(requestWith(`${CONSOLE_ORIGIN}/`), CONSOLE_ORIGIN),
    ).toBe(false);
  });
});

describe("isUnsafeMethod", () => {
  it("treats GET, HEAD, and OPTIONS as safe", () => {
    expect(isUnsafeMethod("GET")).toBe(false);
    expect(isUnsafeMethod("HEAD")).toBe(false);
    expect(isUnsafeMethod("OPTIONS")).toBe(false);
  });

  it("treats POST, PUT, PATCH, and DELETE as unsafe", () => {
    expect(isUnsafeMethod("POST")).toBe(true);
    expect(isUnsafeMethod("PUT")).toBe(true);
    expect(isUnsafeMethod("PATCH")).toBe(true);
    expect(isUnsafeMethod("DELETE")).toBe(true);
  });
});
