import { describe, expect, it } from "vitest";
import {
  readPinnedBackend,
  runPgFixtureChecks,
} from "../../scripts/check-e2e-pg-fixture.mjs";

const REPO_ROOT = process.cwd();
const RUN_ID = "t-ci-1";
const SHA = readPinnedBackend(REPO_ROOT).sha;

const GOOD_ASSEMBLY = {
  kind: "controlhub-e2e-pg-fixture",
  pgEntries: true,
  runId: RUN_ID,
  backendSha: SHA,
  listenAddr: ":8080",
};
const GOOD_TARGETS = {
  items: [
    {
      displayName: "Local PostgreSQL Query Dev",
      connections: [
        { database: "labdb", runtime: "secret_resolved" },
        { database: "labdb_other", runtime: "secret_resolved" },
      ],
    },
  ],
};

const ENV = {
  E2E_RUN_ID: RUN_ID,
  E2E_FIXTURE_ADMIN_EMAIL: "e2e-admin@controlhub-e2e.invalid",
  E2E_FIXTURE_ADMIN_PASSWORD: "pw",
};

type JsonResponder = (url: string, init?: RequestInit) => Promise<Response>;
const res = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

function makeFetch(overrides: Record<string, Response> = {}): JsonResponder {
  return async (url) => {
    if (url.endsWith("/e2e/assembly")) return overrides.assembly ?? res(200, GOOD_ASSEMBLY);
    if (url.endsWith("/auth/login")) return overrides.login ?? res(200, { token: "t" });
    if (url.endsWith("/query-targets")) return overrides.targets ?? res(200, GOOD_TARGETS);
    return res(404, {});
  };
}

const check = (overrides: Parameters<typeof makeFetch>[0] = {}, env = ENV) =>
  runPgFixtureChecks({
    fetchImpl: makeFetch(overrides) as never,
    env: env as never,
    repoRoot: REPO_ROOT,
  });

describe("PG fixture gate", () => {
  it("passes on a fully provisioned fixture", async () => {
    const r = await check();
    expect(r.failures).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("rejects a plain cmd/server (assembly 404)", async () => {
    const r = await check({ assembly: res(404, {}) });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("assembly.reachable");
  });

  it("rejects a mismatched backendSha", async () => {
    const r = await check({
      assembly: res(200, { ...GOOD_ASSEMBLY, backendSha: "0".repeat(40) }),
    });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("assembly.backendSha");
  });

  it("rejects an empty/unstamped backendSha", async () => {
    const r = await check({
      assembly: res(200, { ...GOOD_ASSEMBLY, backendSha: "" }),
    });
    expect(r.ok).toBe(false);
  });

  it("rejects a foreign runId", async () => {
    const r = await check({
      assembly: res(200, { ...GOOD_ASSEMBLY, runId: "stale-run" }),
    });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("assembly.runId");
  });

  it("rejects when PG connections are missing or unresolved", async () => {
    const r = await check({
      targets: res(200, {
        items: [
          {
            displayName: "Local PostgreSQL Query Dev",
            connections: [{ database: "labdb", runtime: "secret_unresolved" }],
          },
        ],
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("target.connections");
  });

  it("rejects when the PG target itself is absent", async () => {
    const r = await check({ targets: res(200, { items: [] }) });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("target.present");
  });

  it("fails closed when E2E_RUN_ID is unset", async () => {
    const r = await check({}, { ...ENV, E2E_RUN_ID: "" });
    expect(r.ok).toBe(false);
    expect(r.failures.join()).toContain("runId.env");
  });
});
