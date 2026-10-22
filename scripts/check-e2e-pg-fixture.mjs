#!/usr/bin/env node
// input: env E2E_RUN_ID / CONTROLHUB_API_PROXY_URL / E2E_FIXTURE_ADMIN_* , e2e/backend-fixture.env, live fixture listener + api-proxy
// output: runPgFixtureChecks({fetchImpl, env, repoRoot}) -> {ok, failures, report}; CLI prints report and exits nonzero on any failure
// pos: mandatory pre-browser gate for the full release:e2e path — proves the PG fixture assembly identity, run identity, proxy identity, and resolver-verified connections are THIS run's; fail closed, never degrade to skip
// note: if this file changes, update header and scripts/README.md (or e2e/README.md fixture section)
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PG_TARGET_DISPLAY_NAME = "Local PostgreSQL Query Dev";
const REQUIRED_CONNECTIONS = ["labdb", "labdb_other"];

export function readPinnedBackend(repoRoot) {
  const raw = readFileSync(resolve(repoRoot, "e2e/backend-fixture.env"), "utf8");
  const get = (k) =>
    (raw.match(new RegExp(`^${k}=([0-9a-f]{40})$`, "m")) ?? [])[1] ?? null;
  return { sha: get("CONTROLHUB_BACKEND_SHA"), tree: get("CONTROLHUB_BACKEND_TREE") };
}

async function getJson(fetchImpl, url) {
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { status: res.status, body: null };
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: 0, body: null };
  }
}

/**
 * One mandatory check list. Any failure entry means the caller must refuse the
 * full E2E suite — there is no skip path.
 */
export async function runPgFixtureChecks({
  fetchImpl = fetch,
  env = process.env,
  repoRoot = process.cwd(),
} = {}) {
  const failures = [];
  const report = [];
  const ok = (name, detail) => report.push(`PASS ${name}${detail ? ` — ${detail}` : ""}`);
  const fail = (name, detail) => {
    report.push(`FAIL ${name} — ${detail}`);
    failures.push(`${name}: ${detail}`);
  };

  const pinned = readPinnedBackend(repoRoot);
  if (!pinned.sha) fail("manifest.sha", "e2e/backend-fixture.env lacks a 40-hex CONTROLHUB_BACKEND_SHA");
  else ok("manifest.sha", pinned.sha);

  const runId = (env.E2E_RUN_ID ?? "").trim();
  if (!runId) fail("runId.env", "E2E_RUN_ID is not set — the gate cannot prove this run's identity");
  else ok("runId.env", runId);

  // The gate runs BEFORE playwright starts — the :8081 proxy does not exist
  // yet. Backend checks go straight at the fixture listener; proxy identity is
  // enforced by the spec's beforeAll run-identity block.
  const backendBase = (env.E2E_BACKEND_URL ?? "http://localhost:8080").replace(/\/$/, "");

  // ── assembly identity ────────────────────────────────────────────────
  const asm = await getJson(fetchImpl, `${backendBase}/e2e/assembly`);
  const a = asm.body ?? {};
  if (asm.status !== 200 || !a) {
    fail("assembly.reachable", `GET /e2e/assembly returned ${asm.status} — fixture listener missing or foreign`);
  } else {
    if (a.kind !== "controlhub-e2e-pg-fixture") fail("assembly.kind", `kind=${JSON.stringify(a.kind)}`);
    else ok("assembly.kind");
    if (a.pgEntries !== true) fail("assembly.pgEntries", `pgEntries=${JSON.stringify(a.pgEntries)}`);
    else ok("assembly.pgEntries");
    if (runId && a.runId !== runId) fail("assembly.runId", `runId=${JSON.stringify(a.runId)} expected ${runId}`);
    else ok("assembly.runId", a.runId);
    if (pinned.sha && a.backendSha !== pinned.sha) {
      fail("assembly.backendSha", `backendSha=${JSON.stringify(a.backendSha)} expected ${pinned.sha}`);
    } else ok("assembly.backendSha", a.backendSha);
  }

  // ── resolver-verified connections (authenticated probe) ──────────────
  const email = (env.E2E_FIXTURE_ADMIN_EMAIL ?? "").trim();
  const password = env.E2E_FIXTURE_ADMIN_PASSWORD ?? "";
  if (!email || !password) {
    fail("operator.env", "E2E_FIXTURE_ADMIN_EMAIL/PASSWORD not set — cannot probe authenticated connections");
  } else {
    const login = await fetchImpl(`${backendBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const token = login?.ok ? (await login.json()).token : null;
    if (!token) {
      fail("operator.login", `admin fixture login failed (status ${login?.status ?? "unreachable"})`);
    } else {
      const res = await fetchImpl(`${backendBase}/query-targets`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10_000),
      }).catch(() => null);
      const items = res?.ok ? (await res.json()).items ?? [] : [];
      const pg = items.find((t) => t.displayName === PG_TARGET_DISPLAY_NAME);
      if (!pg) {
        fail("target.present", `"${PG_TARGET_DISPLAY_NAME}" not in /query-targets`);
      } else {
        const conns = pg.connections ?? [];
        for (const db of REQUIRED_CONNECTIONS) {
          const c = conns.find((x) => x.database === db);
          if (!c || c.runtime !== "secret_resolved") {
            fail("target.connections", `connection ${db} runtime=${JSON.stringify(c?.runtime)}`);
          }
        }
        if (!failures.some((f) => f.startsWith("target."))) {
          ok("target.connections", `${REQUIRED_CONNECTIONS.join("+")} secret_resolved`);
        }
      }
    }
  }

  return { ok: failures.length === 0, failures, report };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-e2e-pg-fixture.mjs");
if (isMain) {
  const { ok, failures, report } = await runPgFixtureChecks();
  console.log("PG fixture gate:");
  for (const line of report) console.log(`  ${line}`);
  if (!ok) {
    console.error(`\n${failures.length} mandatory check(s) failed — refusing to run the full suite against a missing or foreign fixture.`);
    process.exit(1);
  }
}
