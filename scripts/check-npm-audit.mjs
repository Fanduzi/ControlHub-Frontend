#!/usr/bin/env node
import { execFileSync } from "node:child_process";

/**
 * `npm audit --audit-level=high` cannot exempt a single advisory, so the gate
 * is reimplemented here: every high/critical advisory still fails CI except
 * the IDs below. Each entry must carry a reason and a recheck trigger.
 */
const ALLOWLIST = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    reason:
      "picomatch ReDoS, no patched version upstream; prod path is next-intl → @parcel/watcher (dev-time watcher), no user input reaches picomatch",
    recheck: "remove once picomatch publishes a fix",
  },
];

const GHSA_PATTERN = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;
const FAILING_SEVERITIES = new Set(["high", "critical"]);

/**
 * Collect advisory objects (object entries in each vulnerability's `via`)
 * whose own severity is high or critical. String `via` refs are transitive —
 * the root advisory is counted once on the leaf package.
 */
export function collectBlockingAdvisories(auditJson, allowlist = ALLOWLIST) {
  if (
    !auditJson ||
    typeof auditJson !== "object" ||
    !auditJson.vulnerabilities ||
    typeof auditJson.vulnerabilities !== "object" ||
    !auditJson.metadata ||
    typeof auditJson.metadata !== "object"
  ) {
    throw new Error("npm audit output missing vulnerabilities/metadata — refusing to pass");
  }

  const allowed = new Set(allowlist.map((entry) => entry.id.toLowerCase()));
  const exempted = [];
  const blocking = [];

  for (const [pkg, vuln] of Object.entries(auditJson.vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      if (!FAILING_SEVERITIES.has(via.severity)) continue;
      const id = (String(via.url ?? "").match(GHSA_PATTERN) ?? [])[0] ?? via.url ?? "unknown";
      const record = { pkg, id, title: via.title ?? "" };
      if (allowed.has(String(id).toLowerCase())) {
        exempted.push(record);
      } else {
        blocking.push(record);
      }
    }
  }

  return { blocking, exempted };
}

function runAuditJson() {
  try {
    // npm audit exits non-zero when advisories exist — that is the normal path.
    return execFileSync(
      "npm",
      ["audit", "--json", "--registry=https://registry.npmjs.org"],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    if (error.stdout) return error.stdout;
    throw error;
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-npm-audit.mjs");
if (isMain) {
  try {
    const auditJson = JSON.parse(runAuditJson());
    const { blocking, exempted } = collectBlockingAdvisories(auditJson);

    for (const advisory of exempted) {
      const entry = ALLOWLIST.find(
        (item) => item.id.toLowerCase() === String(advisory.id).toLowerCase(),
      );
      console.warn(
        `  WARN exempt ${advisory.pkg} ${advisory.id} — ${entry?.reason ?? "allowlisted"} (recheck: ${entry?.recheck ?? "n/a"})`,
      );
    }

    if (blocking.length > 0) {
      console.error("\nBlocking high/critical advisories:");
      for (const advisory of blocking) {
        console.error(`  FAIL ${advisory.pkg} ${advisory.id} — ${advisory.title}`);
      }
      process.exit(1);
    }

    console.log(
      `npm audit check passed (${exempted.length} allowlisted, 0 blocking).`,
    );
  } catch (error) {
    console.error(`npm audit check failed closed: ${error.message}`);
    process.exit(1);
  }
}
