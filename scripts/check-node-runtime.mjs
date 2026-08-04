// input: root .tool-versions and the active Node.js process version
// output: a zero exit status for Node 22.22.0 or a controlled diagnostic
// pos: fail-fast runtime contract for local npm commands and CI
// note: if changed, update the Phase 38V runtime contract documentation

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const toolVersionsPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.tool-versions');

function fail(message) {
  console.error(`Node runtime check failed: ${message}`);
  process.exitCode = 1;
}

/**
 * @param {{toolVersions: string | undefined, actualVersion: string, toolVersionsPath: string}} input
 * @returns {{passed: boolean, message: string}}
 */
export function evaluateRuntimeContract({ toolVersions, actualVersion, toolVersionsPath: configuredPath }) {
  if (toolVersions === undefined) {
    return {
      passed: false,
      message: `cannot read ${configuredPath}; expected one line "nodejs <major>.<minor>.<patch>"`,
    };
  }

  const entries = toolVersions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (entries.length !== 1) {
    return {
      passed: false,
      message: `invalid ${configuredPath}; expected exactly one nodejs version entry`,
    };
  }

  const [name, expectedVersion, ...extraTokens] = entries[0].split(/\s+/);

  if (
    name !== 'nodejs' ||
    extraTokens.length !== 0 ||
    !/^\d+\.\d+\.\d+$/.test(expectedVersion ?? '')
  ) {
    return {
      passed: false,
      message: `invalid ${configuredPath}; expected exactly "nodejs <major>.<minor>.<patch>"`,
    };
  }

  if (actualVersion !== expectedVersion) {
    return {
      passed: false,
      message: `expected Node ${expectedVersion}, actual Node ${actualVersion}`,
    };
  }

  return {
    passed: true,
    message: `Node runtime check passed: expected Node ${expectedVersion}, actual Node ${actualVersion}`,
  };
}

function run() {
  let toolVersions;

  try {
    toolVersions = readFileSync(toolVersionsPath, 'utf8');
  } catch {
    toolVersions = undefined;
  }

  const result = evaluateRuntimeContract({
    toolVersions,
    actualVersion: process.versions.node,
    toolVersionsPath,
  });

  if (result.passed) {
    console.log(result.message);
  } else {
    fail(result.message);
  }
}

const invokedScriptPath = process.argv[1] ? resolve(process.argv[1]) : undefined;

if (invokedScriptPath === fileURLToPath(import.meta.url)) {
  run();
}
