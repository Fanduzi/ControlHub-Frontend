// input: exported date formatting helpers and fixed clock values
// output: localized relative timestamps with date-time fallback after 24 hours
// pos: shared formatting boundary regression contract
// note: if this file changes, update this header and tests/lib/README.md

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatDateTime, formatRelativeDateTime } from "@/lib/format";

describe("formatRelativeDateTime", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the requested locale for now, minutes, and hours before falling back to date-time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-14T12:00:00Z"));

    expect(formatRelativeDateTime("2026-04-14T12:00:00Z", "zh-CN")).toBe("现在");
    expect(formatRelativeDateTime("2026-04-14T11:59:00Z", "zh-CN")).toBe("1分钟前");
    expect(formatRelativeDateTime("2026-04-14T10:00:00Z", "en")).toBe("2 hours ago");
    expect(formatRelativeDateTime("2026-04-13T12:00:00Z", "zh-CN")).toBe(
      formatDateTime("2026-04-13T12:00:00Z", "zh-CN"),
    );
  });
});
