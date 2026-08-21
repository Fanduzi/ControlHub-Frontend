#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = process.cwd();

const SMOKE_SCRIPT = "test:e2e:smoke";
const INTERACTION_SCRIPT = "test:e2e:interaction";
const FULL_SCRIPT = "test:e2e";
const RELEASE_SCRIPT = "release:e2e";

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function listFiles(dir, predicate) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];

  const result = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...listFiles(rel, predicate));
    } else if (predicate(rel)) {
      result.push(rel);
    }
  }
  return result;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countNpmRun(source, scriptName) {
  const re = new RegExp(`npm run ${escapeRegExp(scriptName)}(?!:)`, "g");
  return (source.match(re) || []).length;
}

function countPlaywrightFullSuite(source) {
  const re = /playwright test\b([^&\n;|]*)/g;
  let count = 0;
  let match;
  while ((match = re.exec(source))) {
    const args = match[1] ?? "";
    if (/\.spec\.ts\b/.test(args) || /\be2e\//.test(args)) {
      continue;
    }
    count += 1;
  }
  return count;
}

function countFullSuiteInvocations(source) {
  return countNpmRun(source, FULL_SCRIPT) + countPlaywrightFullSuite(source);
}

export function evaluateReleaseE2EGraph({ scripts = {}, workflowSource = "" }) {
  const failures = [];
  const smoke = scripts[SMOKE_SCRIPT];
  const interaction = scripts[INTERACTION_SCRIPT];
  const full = scripts[FULL_SCRIPT];
  const release = scripts[RELEASE_SCRIPT];

  if (!smoke) {
    failures.push(`package.json: ${SMOKE_SCRIPT} script must exist for local fast paths`);
  }
  if (!interaction) {
    failures.push(
      `package.json: ${INTERACTION_SCRIPT} script must exist for local fast paths`,
    );
  }
  if (!full) {
    failures.push(`package.json: ${FULL_SCRIPT} script must exist`);
  }

  if (!release) {
    failures.push(`package.json: ${RELEASE_SCRIPT} script must exist`);
  } else {
    if (countNpmRun(release, SMOKE_SCRIPT) > 0) {
      failures.push(`package.json: ${RELEASE_SCRIPT} must not invoke ${SMOKE_SCRIPT}`);
    }
    if (countNpmRun(release, INTERACTION_SCRIPT) > 0) {
      failures.push(
        `package.json: ${RELEASE_SCRIPT} must not invoke ${INTERACTION_SCRIPT}`,
      );
    }

    const fullRuns = countFullSuiteInvocations(release);
    if (fullRuns !== 1) {
      failures.push(
        `package.json: ${RELEASE_SCRIPT} must run the full Playwright suite once (found ${fullRuns})`,
      );
    }
  }

  if (
    countNpmRun(workflowSource, SMOKE_SCRIPT) > 0 ||
    countNpmRun(workflowSource, INTERACTION_SCRIPT) > 0
  ) {
    failures.push(
      "CI workflow must not invoke smoke or interaction as separate suite runs",
    );
  }

  if (workflowSource) {
    const workflowSuiteRuns =
      countNpmRun(workflowSource, RELEASE_SCRIPT) +
      countNpmRun(workflowSource, FULL_SCRIPT) +
      countPlaywrightFullSuite(workflowSource);
    if (workflowSuiteRuns !== 1) {
      failures.push(
        `CI workflow must invoke the full E2E suite once (found ${workflowSuiteRuns})`,
      );
    }
  }

  return { passed: failures.length === 0, failures };
}

function readWorkflowSources() {
  const dir = ".github/workflows";
  if (!exists(dir)) return "";

  return fs
    .readdirSync(path.join(root, dir))
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => read(path.join(dir, file)))
    .join("\n");
}

function run() {
  const failures = [];

  function fail(file, message) {
    failures.push(`${file}: ${message}`);
  }

  if (!exists("docs/e2e-governance.md")) {
    fail("docs/e2e-governance.md", "missing governance document");
  }

  if (exists("playwright.config.ts")) {
    const config = read("playwright.config.ts");
    if (/stderr\s*:\s*["']ignore["']/.test(config)) {
      fail("playwright.config.ts", 'forbidden broad suppression: stderr: "ignore"');
    }
    if (/stdout\s*:\s*["']ignore["']/.test(config)) {
      fail("playwright.config.ts", 'forbidden broad suppression: stdout: "ignore"');
    }
    if (/(^|[^&])2>\s*\/dev\/null/.test(config) || /(^|[^&])>\s*\/dev\/null/.test(config)) {
      fail("playwright.config.ts", "forbidden process output redirection to /dev/null");
    }
  }

  const specs = listFiles("e2e", (file) => file.endsWith(".spec.ts"));

  for (const spec of specs) {
    const source = read(spec);
    const loadsApplicationPage =
      /page\.goto\(["']\/(?!login)/.test(source) ||
      /locator\(["']a\[href=/.test(source) ||
      /getByRole\(["']link/.test(source);

    if (/loginViaApi\s*\(/.test(source) && !source.includes("e2e-governance-allow-loginViaApi")) {
      fail(spec, "loginViaApi used without e2e-governance-allow-loginViaApi exception");
    }

    if (loadsApplicationPage) {
      const hasConsoleGuard =
        source.includes("collectConsoleMessages") &&
        source.includes("collectNetworkErrors") &&
        source.includes("assertClean");
      if (!hasConsoleGuard) {
        fail(spec, "application-page E2E spec must use console/network guards");
      }
    }

    const screenshotCalls = [...source.matchAll(/page\.screenshot\s*\(/g)];
    if (screenshotCalls.length > 0 && !source.includes("testInfo.status !== testInfo.expectedStatus")) {
      fail(spec, "screenshots must be failure-only");
    }
  }

  if (exists("package.json")) {
    const pkg = JSON.parse(read("package.json"));
    const graph = evaluateReleaseE2EGraph({
      scripts: pkg.scripts ?? {},
      workflowSource: readWorkflowSources(),
    });
    failures.push(...graph.failures);
  } else {
    fail("package.json", "missing package.json");
  }

  if (failures.length > 0) {
    console.error("E2E governance check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log(`E2E governance check passed (${specs.length} spec files scanned).`);
}

const invokedScriptPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;

if (invokedScriptPath === fileURLToPath(import.meta.url)) {
  run();
}
