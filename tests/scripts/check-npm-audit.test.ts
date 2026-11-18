import { describe, expect, it } from "vitest";

// @ts-expect-error — plain .mjs helper without type declarations
import { collectBlockingAdvisories } from "../../scripts/check-npm-audit.mjs";

const ADVISORY = {
  source: 1247710,
  name: "picomatch",
  dependency: "picomatch",
  title: "picomatch vulnerable to ReDoS through single-branch repeated extglobs",
  url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
  severity: "high",
};

const OTHER_ADVISORY = {
  source: 1,
  name: "left-pad",
  dependency: "left-pad",
  title: "left-pad is broken",
  url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
  severity: "high",
};

function audit(via: unknown[]) {
  return {
    vulnerabilities: {
      "dep-chain": { severity: "high", via: ["picomatch"] },
      picomatch: { severity: "high", via },
    },
    metadata: { vulnerabilities: { high: 1 } },
  };
}

describe("collectBlockingAdvisories", () => {
  it("passes when only allowlisted advisories are present", () => {
    const { blocking, exempted } = collectBlockingAdvisories(audit([ADVISORY]));
    expect(blocking).toEqual([]);
    expect(exempted).toHaveLength(1);
  });

  it("fails when a non-exempt high advisory is also present", () => {
    const { blocking } = collectBlockingAdvisories(audit([ADVISORY, OTHER_ADVISORY]));
    expect(blocking).toHaveLength(1);
    expect(blocking[0]).toMatchObject({ pkg: "picomatch", id: "GHSA-aaaa-bbbb-cccc" });
  });

  it("ignores non-exempt advisories below high severity", () => {
    const { blocking, exempted } = collectBlockingAdvisories(
      audit([{ ...OTHER_ADVISORY, severity: "moderate" }]),
    );
    expect(blocking).toEqual([]);
    expect(exempted).toEqual([]);
  });
});
