// input: node:fs/path, vitest, e2e/query-workbench.spec.ts source
// output: static regression checks for safe query-workbench target-selection policy
// pos: fast E2E governance seam preventing forced or duplicate connection selection
// note: if this file changes, update this header and tests/README.md.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SPEC_PATH = resolve(process.cwd(), "e2e/query-workbench.spec.ts");

function extractFunctionBody(source: string, functionName: string): string {
  const start = source.indexOf(`async function ${functionName}`);
  if (start < 0) {
    throw new Error(`Missing async function ${functionName} in ${SPEC_PATH}`);
  }
  const braceStart = source.indexOf("{", start);
  if (braceStart < 0) {
    throw new Error(`Missing body for ${functionName}`);
  }
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart, index + 1);
      }
    }
  }
  throw new Error(`Unclosed body for ${functionName}`);
}

describe("query-workbench connection selection policy", () => {
  const source = readFileSync(SPEC_PATH, "utf8");
  const selectBody = extractFunctionBody(source, "selectConnectionTarget");
  const readyBody = extractFunctionBody(source, "waitForCommittedRunState");

  it("P3-1: selectConnectionTarget never uses force:true", () => {
    expect(selectBody).not.toMatch(/force\s*:\s*true/);
    expect(selectBody).toMatch(/scrollIntoViewIfNeeded\s*\(/);
    expect(selectBody).toMatch(/\.click\s*\(\s*\)/);
    expect(selectBody).toMatch(/toBeHidden\(\s*\{\s*timeout:\s*5_000\s*\}\s*\)/);
  });

  it("P3-2: selecting the current target is a no-op before click to avoid duplicate workspace writers", () => {
    const currentTargetCheck = selectBody.indexOf('getAttribute("aria-current")');
    const targetClick = selectBody.indexOf("await target.click()");

    expect(currentTargetCheck).toBeGreaterThan(-1);
    expect(currentTargetCheck).toBeLessThan(targetClick);
    expect(selectBody).toMatch(/if\s*\(isCurrent\)[\s\S]*return;/);
  });

  it("P3-1: waitForCommittedRunState keeps 5s deadline and 5 stable samples", () => {
    expect(readyBody).toMatch(/Date\.now\(\)\s*\+\s*5_000/);
    expect(readyBody).toMatch(/stableSamples\s*>=\s*5/);
    expect(readyBody).not.toMatch(/Date\.now\(\)\s*\+\s*2_000/);
    expect(readyBody).not.toMatch(/stableSamples\s*>=\s*3/);
  });
});
