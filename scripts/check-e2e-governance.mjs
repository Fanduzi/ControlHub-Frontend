#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

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

if (failures.length > 0) {
  console.error("E2E governance check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`E2E governance check passed (${specs.length} spec files scanned).`);
