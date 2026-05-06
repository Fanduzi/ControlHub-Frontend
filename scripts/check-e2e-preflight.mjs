#!/usr/bin/env node

import { execSync } from "node:child_process";

const E2E_PORTS = [3100, 8081];

export function parseLsofOutput(output) {
  if (!output || !output.trim()) return [];

  return output
    .trim()
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split(/\s+/);
      if (parts.length < 2) return null;
      return { command: parts[0], pid: parts[1] };
    })
    .filter(Boolean);
}

export function formatPortWarning(port, listeners) {
  if (listeners.length === 0) {
    return `  :${port} — free`;
  }

  const details = listeners
    .map((l) => `    PID ${l.pid} (${l.command})`)
    .join("\n");
  return `  :${port} — ${listeners.length} listener(s)\n${details}\n    Stale processes can break E2E proxy recording if :3100 was started without CONTROLHUB_API_BASE_URL=http://localhost:8081`;
}

export function shouldFailPreflight({ strict, listeners }) {
  if (!strict) return false;
  return listeners.some((l) => l.port !== undefined);
}

function checkPort(port) {
  try {
    const output = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN 2>/dev/null || true`, {
      encoding: "utf8",
      timeout: 5000,
    });
    return parseLsofOutput(output);
  } catch {
    return [];
  }
}

function main() {
  const strict = process.argv.includes("--strict");

  console.log("E2E preflight check:\n");

  let hasListeners = false;

  for (const port of E2E_PORTS) {
    const listeners = checkPort(port);
    console.log(formatPortWarning(port, listeners));
    if (listeners.length > 0) hasListeners = true;
  }

  if (hasListeners && !strict) {
    console.log(
      "\nListeners detected. If these are stale (not from current Playwright run), kill them before E2E.",
    );
    console.log("Run with --strict to fail when listeners are present.");
  }

  if (strict && hasListeners) {
    console.error("\nStrict mode: failing because listeners were detected on E2E ports.");
    process.exit(1);
  }

  console.log("\nPreflight complete.");
}

main();
