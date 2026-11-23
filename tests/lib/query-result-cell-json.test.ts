import { describe, expect, it } from "vitest";

import { formatResultJson } from "@/lib/query-result-cell-json";

describe("formatResultJson", () => {
  it("indents while preserving number lexemes, duplicate keys, order and escapes", () => {
    const input = `{"n":9007199254740993,"n":1.20e+4,"raw":"a\\"b;","empty":[{},[]]}`;
    expect(formatResultJson(input)).toBe(`{
  "n": 9007199254740993,
  "n": 1.20e+4,
  "raw": "a\\"b;",
  "empty": [
    {},
    []
  ]
}`);
  });

  it("keeps semicolons, braces and commas inside string tokens verbatim", () => {
    const input = `{"s":"a;}{,b","t":":,"}`;
    expect(formatResultJson(input)).toBe(`{
  "s": "a;}{,b",
  "t": ":,"
}`);
  });

  it("returns null for malformed JSON", () => {
    expect(formatResultJson(`{"a":`)).toBeNull();
    expect(formatResultJson(`[1,2`)).toBeNull();
    expect(formatResultJson(`{"a":1} trailing`)).toBeNull();
  });

  it("returns null for scalars and non-JSON text", () => {
    expect(formatResultJson("42")).toBeNull();
    expect(formatResultJson("true")).toBeNull();
    expect(formatResultJson(`"string"`)).toBeNull();
    expect(formatResultJson("select 1")).toBeNull();
  });

  it("returns null past the depth bound", () => {
    const deep = "[".repeat(33) + "]".repeat(33);
    expect(formatResultJson(deep)).toBeNull();
    expect(formatResultJson("[".repeat(32) + "]".repeat(32))).not.toBeNull();
  });

  it("returns null past the length bound", () => {
    const huge = "[" + "1,".repeat(8191) + "1]";
    expect(huge.length).toBeGreaterThan(16_384);
    expect(formatResultJson(huge)).toBeNull();
  });
});
