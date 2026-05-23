import { describe, expect, it } from "vitest";

import {
  hasForbiddenRawEnum,
  summarizeSmokeResult,
} from "../../scripts/cdp-release-smoke.mjs";

describe("hasForbiddenRawEnum", () => {
  it("detects abnormal_first in visible text", () => {
    expect(hasForbiddenRawEnum("排序 abnormal_first")).toBe(true);
  });

  it("detects needs_attention in visible text", () => {
    expect(hasForbiddenRawEnum("运维信号 needs_attention")).toBe(true);
  });

  it("does not flag localized Chinese labels", () => {
    expect(hasForbiddenRawEnum("排序 异常优先")).toBe(false);
    expect(hasForbiddenRawEnum("需关注")).toBe(false);
  });
});

describe("summarizeSmokeResult", () => {
  it("returns pass summary when all checks pass", () => {
    const result = summarizeSmokeResult([
      { url: "/overview?environment=prod", ok: true, checks: [] },
      { url: "/databases?environment=prod", ok: true, checks: [] },
    ]);
    expect(result).toBe("CDP release smoke passed");
  });

  it("summarizes failed page checks with URL and reason", () => {
    const result = summarizeSmokeResult([
      { url: "/overview?environment=prod", ok: true, checks: [] },
      {
        url: "/databases?environment=prod",
        ok: false,
        checks: ["raw enum leak"],
      },
      {
        url: "/resources/14",
        ok: false,
        checks: ["missing text: 资源"],
      },
    ]);
    expect(result).toContain("/databases?environment=prod");
    expect(result).toContain("/resources/14");
    expect(result).toContain("raw enum leak");
    expect(result).toContain("missing text: 资源");
    expect(result).not.toContain("/overview");
  });
});
