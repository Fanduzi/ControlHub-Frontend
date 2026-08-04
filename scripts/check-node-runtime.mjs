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

let toolVersions;

try {
  toolVersions = readFileSync(toolVersionsPath, 'utf8');
} catch {
  fail(`cannot read ${toolVersionsPath}; expected one line "nodejs <major>.<minor>.<patch>"`);
}

if (toolVersions !== undefined) {
  const entries = toolVersions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (entries.length !== 1) {
    fail(`invalid ${toolVersionsPath}; expected exactly one nodejs version entry`);
  } else {
    const [name, expectedVersion, ...extraTokens] = entries[0].split(/\s+/);

    if (
      name !== 'nodejs' ||
      extraTokens.length !== 0 ||
      !/^\d+\.\d+\.\d+$/.test(expectedVersion ?? '')
    ) {
      fail(`invalid ${toolVersionsPath}; expected exactly "nodejs <major>.<minor>.<patch>"`);
    } else {
      const actualVersion = process.versions.node;

      if (actualVersion !== expectedVersion) {
        fail(`expected Node ${expectedVersion}, actual Node ${actualVersion}`);
      } else {
        console.log(`Node runtime check passed: expected Node ${expectedVersion}, actual Node ${actualVersion}`);
      }
    }
  }
}
