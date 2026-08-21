// input: vitest, scripts/check-e2e-governance.mjs
// output: chained smoke+interaction+full fails; full-suite-once passes; local subset scripts remain
// pos: CI release:e2e graph must not re-execute Playwright specs already in the full suite
// note: if this file changes, update header
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { evaluateReleaseE2EGraph } from "../../scripts/check-e2e-governance.mjs";

const FULL_SUITE_SCRIPTS = {
  "test:e2e": "env -u NO_COLOR playwright test",
  "test:e2e:smoke": "env -u NO_COLOR playwright test e2e/operator-console-smoke.spec.ts",
  "test:e2e:interaction":
    "env -u NO_COLOR playwright test e2e/operator-interaction-stability.spec.ts",
} as const;

const CI_RELEASE_E2E_ONCE = `
jobs:
  release-e2e:
    steps:
      - name: Run frontend E2E release gates
        run: npm run release:e2e
`;

describe("evaluateReleaseE2EGraph", () => {
  it("fails when release:e2e chains smoke and interaction in front of the full suite", () => {
    const result = evaluateReleaseE2EGraph({
      scripts: {
        ...FULL_SUITE_SCRIPTS,
        "release:e2e":
          "npm run test:e2e:smoke && npm run test:e2e:interaction && npm run test:e2e",
      },
      workflowSource: CI_RELEASE_E2E_ONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("test:e2e:smoke"))).toBe(
      true,
    );
    expect(
      result.failures.some((failure) => failure.includes("test:e2e:interaction")),
    ).toBe(true);
  });

  it("fails when local smoke or interaction scripts are removed", () => {
    const result = evaluateReleaseE2EGraph({
      scripts: {
        "test:e2e": FULL_SUITE_SCRIPTS["test:e2e"],
        "release:e2e": "npm run test:e2e",
      },
      workflowSource: CI_RELEASE_E2E_ONCE,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => failure.includes("test:e2e:smoke"))).toBe(
      true,
    );
    expect(
      result.failures.some((failure) => failure.includes("test:e2e:interaction")),
    ).toBe(true);
  });

  it("fails when CI also invokes smoke or interaction as separate suite runs", () => {
    const result = evaluateReleaseE2EGraph({
      scripts: {
        ...FULL_SUITE_SCRIPTS,
        "release:e2e": "npm run test:e2e",
      },
      workflowSource: `
jobs:
  release-e2e:
    steps:
      - run: npm run test:e2e:smoke
      - run: npm run test:e2e:interaction
      - run: npm run release:e2e
`,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => /smoke|interaction/.test(failure))).toBe(
      true,
    );
  });

  it("fails when the full Playwright suite is invoked more than once in CI", () => {
    const result = evaluateReleaseE2EGraph({
      scripts: {
        ...FULL_SUITE_SCRIPTS,
        "release:e2e": "npm run test:e2e",
      },
      workflowSource: `
jobs:
  release-e2e:
    steps:
      - run: npm run release:e2e
      - run: npm run test:e2e
`,
    });

    expect(result.passed).toBe(false);
    expect(result.failures.some((failure) => /once/.test(failure))).toBe(true);
  });

  it("passes when CI release:e2e is the full suite once and local subset scripts remain", () => {
    const result = evaluateReleaseE2EGraph({
      scripts: {
        ...FULL_SUITE_SCRIPTS,
        "release:e2e": "npm run test:e2e",
      },
      workflowSource: CI_RELEASE_E2E_ONCE,
    });

    expect(result).toEqual({ passed: true, failures: [] });
  });
});

describe("checked-in release E2E graph", () => {
  it("CI release:e2e runs the full Playwright suite once", () => {
    const root = resolve(process.cwd());
    const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
      .scripts as Record<string, string>;
    const workflowSource = readFileSync(
      join(root, ".github/workflows/frontend-ci.yml"),
      "utf8",
    );

    expect(evaluateReleaseE2EGraph({ scripts, workflowSource })).toEqual({
      passed: true,
      failures: [],
    });
  });
});
