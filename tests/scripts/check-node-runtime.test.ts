import { mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

import { evaluateRuntimeContract } from "../../scripts/check-node-runtime.mjs";

const toolVersionsPath = "/project/.tool-versions";
const scriptPath = resolve(process.cwd(), "scripts/check-node-runtime.mjs");

describe("Node runtime contract", () => {
  it("accepts the locked version when the active runtime matches", () => {
    const result = evaluateRuntimeContract({
      toolVersions: "nodejs 22.22.0\n",
      actualVersion: "22.22.0",
      toolVersionsPath,
    });

    expect(result).toEqual({
      passed: true,
      message: "Node runtime check passed: expected Node 22.22.0, actual Node 22.22.0",
    });
  });

  it("rejects a runtime mismatch with expected and actual versions", () => {
    const result = evaluateRuntimeContract({
      toolVersions: "nodejs 22.22.0\n",
      actualVersion: "25.9.0",
      toolVersionsPath,
    });

    expect(result).toEqual({
      passed: false,
      message: "expected Node 22.22.0, actual Node 25.9.0",
    });
  });

  it.each([
    ["empty", "", 'invalid /project/.tool-versions; expected exactly one nodejs version entry'],
    ["malformed version", "nodejs 22.22.0.1\n", 'invalid /project/.tool-versions; expected exactly "nodejs <major>.<minor>.<patch>"'],
    ["duplicate entries", "nodejs 22.22.0\nnodejs 22.22.0\n", 'invalid /project/.tool-versions; expected exactly one nodejs version entry'],
    ["extra token", "nodejs 22.22.0 extra\n", 'invalid /project/.tool-versions; expected exactly "nodejs <major>.<minor>.<patch>"'],
  ])("fails closed for %s tool version configuration", (_caseName, toolVersions, message) => {
    const result = evaluateRuntimeContract({
      toolVersions,
      actualVersion: "22.22.0",
      toolVersionsPath,
    });

    expect(result).toEqual({ passed: false, message });
  });

  it("fails closed when .tool-versions cannot be read", () => {
    const result = evaluateRuntimeContract({
      toolVersions: undefined,
      actualVersion: "22.22.0",
      toolVersionsPath,
    });

    expect(result).toEqual({
      passed: false,
      message: 'cannot read /project/.tool-versions; expected one line "nodejs <major>.<minor>.<patch>"',
    });
  });

  it("resolves the project .tool-versions instead of the current working directory", () => {
    const temporaryCwd = mkdtempSync(join(tmpdir(), "check-node-runtime-cwd-"));

    try {
      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: temporaryCwd,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "Node runtime check passed: expected Node 22.22.0, actual Node 22.22.0",
      );
      expect(result.stderr).toBe("");
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });

  it("does not run the CLI flow when the guard is imported", () => {
    const temporaryCwd = mkdtempSync(join(tmpdir(), "check-node-runtime-import-"));
    const moduleUrl = pathToFileURL(scriptPath).href;

    try {
      const result = spawnSync(
        process.execPath,
        ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl)})`],
        { cwd: temporaryCwd, encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      rmSync(temporaryCwd, { recursive: true, force: true });
    }
  });
});
