import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const UP = join(REPO_ROOT, "scripts/e2e/pg-fixture-up.sh");
const DOWN = join(REPO_ROOT, "scripts/e2e/pg-fixture-down.sh");
const EVIDENCE = join(REPO_ROOT, "scripts/e2e/pg-fixture-evidence.sh");
const LIB = join(REPO_ROOT, "scripts/e2e/pg-fixture-lib.sh");
const RUN_ID = "t-life-1";
const DSN = "meta:pw@tcp(127.0.0.1:3306)/controlhub_x_e2e?parseTime=true";

interface Fixture {
  dir: string;
  backendDir: string;
  backendSha: string;
  backendTree: string;
  stateBase: string;
  runDir: string;
  evidenceDir: string;
  callLog: string;
  env: NodeJS.ProcessEnv;
  spawned: number[];
}

let fx: Fixture;

const sh = (name: string, body: string) => {
  const p = join(fx.dir, "bin", name);
  writeFileSync(p, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
};

const run = (script: string, extra: Record<string, string | undefined> = {}) => {
  try {
    const out = execFileSync("bash", [script], {
      env: { ...fx.env, ...extra },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: String(out) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
};

const calls = () =>
  existsSync(fx.callLog) ? readFileSync(fx.callLog, "utf8") : "";

// Drive a single shared-lib primitive under the same stub PATH/env.
const runLib = (
  scriptlet: string,
  extra: Record<string, string | undefined> = {},
) => {
  try {
    const out = execFileSync("bash", ["-c", `. "${LIB}"; ${scriptlet}`], {
      env: { ...fx.env, ...extra },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: String(out) };
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
};

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "pgfix-life-"));
  mkdirSync(join(dir, "bin"));
  const backendDir = join(dir, "backend");
  execFileSync("git", ["init", "-q", backendDir]);
  execFileSync("git", ["-C", backendDir, "config", "user.email", "t@t.t"]);
  execFileSync("git", ["-C", backendDir, "config", "user.name", "t"]);
  mkdirSync(join(backendDir, "cmd/e2e-pg-server"), { recursive: true });
  writeFileSync(join(backendDir, "cmd/e2e-pg-server/main.go"), "package main\n");
  execFileSync("git", ["-C", backendDir, "add", "-A"]);
  execFileSync("git", ["-C", backendDir, "commit", "-qm", "x"]);
  const backendSha = execFileSync("git", ["-C", backendDir, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const backendTree = execFileSync("git", ["-C", backendDir, "rev-parse", "HEAD^{tree}"], {
    encoding: "utf8",
  }).trim();

  const stateBase = join(dir, "state");
  const evidenceDir = join(dir, "evidence");
  const callLog = join(dir, "calls.log");
  const manifest = join(dir, "manifest.env");
  writeFileSync(
    manifest,
    `CONTROLHUB_BACKEND_SHA=${backendSha}\nCONTROLHUB_BACKEND_TREE=${backendTree}\n`,
  );

  fx = {
    dir,
    backendDir,
    backendSha,
    backendTree,
    stateBase,
    runDir: join(stateBase, RUN_ID),
    evidenceDir,
    callLog,
    spawned: [],
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      PG_FIXTURE_STATE_DIR: stateBase,
      PG_FIXTURE_EVIDENCE_DIR: evidenceDir,
      PG_FIXTURE_MANIFEST: manifest,
      E2E_RUN_ID: RUN_ID,
      BACKEND_DIR: backendDir,
      DATABASE_DSN: DSN,
      JWT_SECRET: "x".repeat(40),
      PG_HOST_PORT: "55439",
      APP_PORT: "18099",
      CALL_LOG: callLog,
      STUB_BACKEND_DIR: backendDir,
      GITHUB_ACTIONS: "",
    },
  };

  // ── command stunt doubles (log every call to $CALL_LOG) ──
  sh("docker", `
echo "docker $@" >> "$CALL_LOG"
store="${fx.dir}/docker-store"; mkdir -p "$store"
case "$1" in
  create) shift; cid="c$(date +%s%N | tr -d ' ')"
    touch "$store/$cid"; echo "$cid" ;;
  start) shift; [ "${"$"}{STUB_DOCKER_FAIL:-}" = "start" ] && exit 1; touch "$store/$1.started" ;;
  cp) exit 0 ;;
  exec) cid="$2"; shift 2
    if [ "${"$"}{STUB_DOCKER_FAIL:-}" = "seed" ] && [[ "$*" == *"-f /tmp/pg-fixture-seed.sql"* ]]; then exit 1; fi
    if [[ "$*" == *"pg_isready"* ]]; then exit 0; fi
    if [[ "$*" == *"select version()"* ]]; then echo "PostgreSQL 17.10 fake"; exit 0; fi
    if [[ "$*" == *"count(*) from e2e.paging"* ]]; then echo 60; exit 0; fi
    exit 0 ;;
  inspect) shift
    case "${"$"}{STUB_DOCKER_INSPECT_MODE:-}" in
      nosuch) echo "Error response from daemon: No such object: $1" >&2; exit 1 ;;
      daemon) echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" >&2; exit 1 ;;
      permission) echo "Error response from daemon: permission denied while trying to connect" >&2; exit 1 ;;
      timeout) echo "Error response from daemon: i/o timeout" >&2; exit 1 ;;
    esac
    [ "${"$"}{STUB_DOCKER_FAIL:-}" = "daemon" ] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    [ -f "$store/$1" ] || { echo "Error response from daemon: No such object: $1" >&2; exit 1; } ;;
  rm) shift
    [ "$1" = "-f" ] && shift
    case "${"$"}{STUB_DOCKER_FAIL:-}" in rm|daemon) echo "rm: simulated failure" >&2; exit 1 ;; esac
    if [ -f "$store/$1" ]; then rm -f "$store/$1" "$store/$1.started"; else echo "No such container: $1" >&2; exit 1; fi ;;
  *) exit 0 ;;
esac`);

  sh("mysql", `
echo "mysql $*" >> "$CALL_LOG"
[ "${"$"}{STUB_MYSQL_FAIL:-}" = "1" ] && exit 1
if [[ "$*" == *"SELECT COUNT(*) FROM query_result_disclosure_policies"* ]]; then echo 19; else cat >/dev/null; fi
exit 0`);

  sh("curl", `
echo "curl $*" >> "$CALL_LOG"
if [[ "$*" == *"/e2e/assembly"* ]] && [ "${"$"}{STUB_CURL_FAIL:-}" = "assembly" ]; then exit 1; fi
if [[ "$*" == *"/health"* ]]; then exit 0; fi
if [[ "$*" == *"/e2e/assembly"* ]]; then
  printf '{\\n  "backendSha": "%s",\\n  "kind": "controlhub-e2e-pg-fixture",\\n  "listenAddr": ":8080",\\n  "pgEntries": true,\\n  "runId": "%s"\\n}\\n' "$(git -C "$STUB_BACKEND_DIR" rev-parse HEAD)" "$E2E_RUN_ID"
  exit 0
fi
exit 1`);

  sh("go", `
echo "go $*" >> "$CALL_LOG"
if [ "$1" = "build" ]; then
  out=""; prev=""
  for a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done
  # Compile a REAL binary so the listener process's exe path resolves to the
  # recorded fixture path (a script would resolve to its interpreter).
  if command -v cc >/dev/null 2>&1; then
    printf '#include <unistd.h>\\nint main(void){for(;;)pause();}\\n' | cc -x c -o "$out" - 2>/dev/null
  fi
  [ -f "$out" ] || { printf '#!/bin/sh\\nsleep 300\\n' > "$out"; chmod +x "$out"; }
  exit 0
fi
if [ "$1" = "version" ]; then
  printf 'build\\tvcs.revision=%s\\nbuild\\tvcs.modified=false\\n' "$(git -C "$STUB_BACKEND_DIR" rev-parse HEAD)"
  exit 0
fi
exit 0`);
});

afterEach(() => {
  for (const pid of fx.spawned) {
    try {
      process.kill(pid, 9);
    } catch {
      /* already gone */
    }
  }
  // Best-effort: kill any leftover sleeper binaries owned by this fixture.
  try {
    const pidFile = join(fx.runDir, "fixture.pid");
    if (existsSync(pidFile)) {
      const pid = Number(readFileSync(pidFile, "utf8"));
      process.kill(pid, 9);
    }
  } catch {
    /* already gone */
  }
  rmSync(fx.dir, { recursive: true, force: true });
});

describe("A: input precheck precedes every side effect", () => {
  const expectPreCheckRefusal = (dsn: string) => {
    const r = run(UP, { DATABASE_DSN: dsn });
    expect(r.code).toBe(1);
    expect(calls()).toBe("");
    expect(existsSync(fx.runDir)).toBe(false);
  };

  it("rejects a remote metadata host before docker/mysql run", () => {
    expectPreCheckRefusal("meta:pw@tcp(192.0.2.55:3306)/controlhub_x_e2e?parseTime=true");
  });
  it("rejects a non-disposable database name", () => {
    expectPreCheckRefusal("meta:pw@tcp(127.0.0.1:3306)/controlhub_prod?parseTime=true");
  });
  it("rejects malformed DSNs and out-of-range ports", () => {
    expectPreCheckRefusal("meta:pw@tcp(127.0.0.1:abc)/controlhub_x_e2e?parseTime=true");
    expectPreCheckRefusal("meta:pw@tcp(127.0.0.1:99999)/controlhub_x_e2e?parseTime=true");
    expectPreCheckRefusal("garbage-without-shape");
  });
  it("rejects a dirty backend worktree", () => {
    writeFileSync(join(fx.backendDir, "dirty.go"), "package x\n");
    const r = run(UP);
    expect(r.code).toBe(1);
    expect(r.out).toContain("uncommitted");
    expect(existsSync(fx.runDir)).toBe(false);
  });
});

describe("B: owned resource lifecycle", () => {
  it("up succeeds end-to-end: create→register→start ordering holds", () => {
    const r = run(UP);
    expect(r.code).toBe(0);
    expect(readFileSync(join(fx.runDir, "state.env"), "utf8")).toContain("STATUS=up");
    const log = calls();
    expect(log.indexOf("docker create")).toBeLessThan(log.indexOf("docker start"));
    expect(log.indexOf("docker create")).toBeLessThan(log.indexOf("docker exec"));
    expect(log).toContain("ON_ERROR_STOP=1");
  });

  it("refuses a second up while the first run's state exists", () => {
    expect(run(UP).code).toBe(0);
    const before = readFileSync(join(fx.runDir, "state.env"), "utf8");
    const r = run(UP);
    expect(r.code).toBe(1);
    expect(readFileSync(join(fx.runDir, "state.env"), "utf8")).toBe(before);
  });

  it("container create-fail/start-fail converges on cleanup", () => {
    const r = run(UP, { STUB_DOCKER_FAIL: "start" });
    expect(r.code).toBe(1);
    expect(calls()).toContain("docker rm -f");
    expect(readFileSync(join(fx.runDir, "state.env"), "utf8")).toContain("STATUS=failed");
  });

  it("seed failure cleans the registered container", () => {
    const r = run(UP, { STUB_DOCKER_FAIL: "seed" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("pg seed failed");
    expect(calls()).toContain("docker rm -f");
    expect(existsSync(join(fx.runDir, "mysql-client.cnf"))).toBe(false);
  });

  it("normal down kills the verified listener and removes the owned container", () => {
    expect(run(UP).code).toBe(0);
    const pid = Number(readFileSync(join(fx.runDir, "fixture.pid"), "utf8"));
    const r = run(DOWN);
    expect(r.code).toBe(0);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(existsSync(fx.runDir)).toBe(false);
    const again = run(DOWN);
    expect(again.code).toBe(0);
    expect(again.out).toContain("nothing");
  });

  it("down never signals a foreign process on a stale PID record", () => {
    mkdirSync(fx.runDir, { recursive: true });
    writeFileSync(join(fx.runDir, ".owned-by-e2e-pg-fixture"), "");
    const sleeper = spawn("sleep", ["60"], { detached: true });
    fx.spawned.push(sleeper.pid!);
    writeFileSync(
      join(fx.runDir, "state.env"),
      `E2E_RUN_ID=${RUN_ID}\nFIXTURE_PID=${sleeper.pid}\nFIXTURE_EXE=/recorded/e2e-pg-server\nSTATUS=up\n`,
    );
    const r = run(DOWN);
    expect(r.code).toBe(1);
    expect(() => process.kill(sleeper.pid!, 0)).not.toThrow();
    expect(existsSync(join(fx.runDir, "state.env"))).toBe(true);
  });

  it("container rm failure preserves state; retry recovers", () => {
    expect(run(UP).code).toBe(0);
    const r = run(DOWN, { STUB_DOCKER_FAIL: "rm" });
    expect(r.code).toBe(1);
    expect(existsSync(join(fx.runDir, "state.env"))).toBe(true);
    const retry = run(DOWN);
    expect(retry.code).toBe(0);
    expect(existsSync(fx.runDir)).toBe(false);
  });

  it("unclassifiable daemon error is not reported as already-gone", () => {
    expect(run(UP).code).toBe(0);
    const r = run(DOWN, { STUB_DOCKER_FAIL: "daemon" });
    expect(r.code).toBe(1);
    expect(r.out).not.toContain("already gone");
    expect(existsSync(join(fx.runDir, "state.env"))).toBe(true);
  });
});

describe("C: sanitized evidence", () => {
  it("collects whitelist files with credential shapes redacted", () => {
    expect(run(UP).code).toBe(0);
    writeFileSync(
      join(fx.runDir, "fixture-server.log"),
      "listen ok password=s3cr3t Bearer abcdef123456\n",
    );
    const r = run(EVIDENCE);
    expect(r.code).toBe(0);
    const names = readdirSync(fx.evidenceDir).sort();
    expect(names).toContain("run-manifest.txt");
    expect(names).toContain(`${RUN_ID}-assembly.json`);
    expect(names).toContain(`${RUN_ID}-pg-seed.log`);
    expect(names).toContain(`${RUN_ID}-fixture-server.log`);
    const log = readFileSync(join(fx.evidenceDir, `${RUN_ID}-fixture-server.log`), "utf8");
    expect(log).not.toContain("s3cr3t");
    expect(log).toContain("REDACTED");
    for (const banned of ["state.env", "mysql-client.cnf", "fixture.pid", "e2e-pg-server"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("fails closed when a completed run lacks required evidence", () => {
    expect(run(UP).code).toBe(0);
    rmSync(join(fx.runDir, "assembly.json"));
    const r = run(EVIDENCE);
    expect(r.code).toBe(1);
    expect(r.out).toContain("assembly.json");
  });
});

// Build a REAL sleeper binary via the go-build stub so the process's exe path
// resolves exactly to a recorded fixture path.
const buildSleeper = (out?: string) => {
  const target = out ?? join(fx.dir, "e2e-pg-server");
  execFileSync("go", ["build", "-o", target, "x"], { env: fx.env });
  return target;
};

describe("B-01: classified docker removal (shared lib)", () => {
  const mkContainer = () => {
    const cid = execFileSync("docker", ["create", "--name", "x", "img"], {
      env: fx.env,
      encoding: "utf8",
    }).trim();
    return cid;
  };

  it("rm success → confirmed removed", () => {
    const cid = mkContainer();
    const r = runLib(`pg_fixture_rm_container "${cid}"`);
    expect(r.code).toBe(0);
  });

  it("rm failure + container still exists → non-zero, never 'gone'", () => {
    const cid = mkContainer();
    const r = runLib(`pg_fixture_rm_container "${cid}"`, { STUB_DOCKER_FAIL: "rm" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("still exists");
    expect(r.out).not.toContain("confirmed absent");
  });

  it("rm failure + explicit NotFound inspect → idempotent success", () => {
    const cid = mkContainer();
    const r = runLib(`pg_fixture_rm_container "${cid}"`, {
      STUB_DOCKER_FAIL: "rm",
      STUB_DOCKER_INSPECT_MODE: "nosuch",
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("confirmed absent");
  });

  it.each(["daemon", "permission", "timeout"])(
    "rm failure + unclassifiable inspect (%s) → non-zero, keeps both errors",
    (mode) => {
      const cid = mkContainer();
      const r = runLib(`pg_fixture_rm_container "${cid}"`, {
        STUB_DOCKER_FAIL: "rm",
        STUB_DOCKER_INSPECT_MODE: mode,
      });
      expect(r.code).toBe(1);
      expect(r.out).toContain("cannot classify");
      expect(r.out).toContain("simulated failure");
    },
  );
});

describe("B-02: verified PID termination (shared lib)", () => {
  // Start processes as orphans (bash exits, init reaps) — a node-child would
  // linger as a zombie after SIGKILL and kill -0 would keep succeeding.
  const spawnOrphan = (exe: string, args: string[] = []) => {
    const out = execFileSync(
      "bash",
      ["-c", `"$0" "$@" >/dev/null 2>&1 & echo $!`, exe, ...args],
      { env: fx.env, encoding: "utf8" },
    );
    const pid = Number(out.trim());
    fx.spawned.push(pid);
    return pid;
  };

  it("refuses to signal a foreign process (exe mismatch)", () => {
    const pid = spawnOrphan("sleep", ["60"]);
    const r = runLib(
      `pg_fixture_stop_pid ${pid} "${join(fx.dir, "e2e-pg-server")}"`,
    );
    expect(r.code).toBe(1);
    expect(() => process.kill(pid, 0)).not.toThrow();
  });

  it("terminates a verified own-executable listener (TERM wait)", () => {
    const exe = buildSleeper();
    const pid = spawnOrphan(exe);
    const r = runLib(`pg_fixture_stop_pid ${pid} "${exe}"`);
    expect(r.code).toBe(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it("matches the recorded exe through a symlinked parent path", () => {
    const realDir = join(fx.dir, "realbin");
    mkdirSync(realDir);
    const exe = buildSleeper(join(realDir, "e2e-pg-server"));
    const pid = spawnOrphan(exe);
    const alias = join(fx.dir, "aliasbin");
    symlinkSync(realDir, alias);
    const r = runLib(`pg_fixture_stop_pid ${pid} "${alias}/e2e-pg-server"`);
    expect(r.code).toBe(0);
  });
});

describe("B-02: up-failure cleanup uses the same identity rules", () => {
  it("assembly failure kills the verified listener and removes the container", () => {
    const r = run(UP, { STUB_CURL_FAIL: "assembly" });
    expect(r.code).toBe(1);
    const pid = Number(readFileSync(join(fx.runDir, "fixture.pid"), "utf8"));
    expect(() => process.kill(pid, 0)).toThrow();
    expect(calls()).toContain("docker rm -f");
    expect(readFileSync(join(fx.runDir, "state.env"), "utf8")).toContain("STATUS=failed");
  });

  it("cleanup failure is recorded as incomplete and down retries to recovery", () => {
    const up = run(UP, { STUB_CURL_FAIL: "assembly", STUB_DOCKER_FAIL: "rm" });
    expect(up.code).toBe(1);
    expect(readFileSync(join(fx.runDir, "state.env"), "utf8")).toContain(
      "STATUS=failed-cleanup-incomplete",
    );
    const down = run(DOWN);
    expect(down.code).toBe(0);
    expect(existsSync(fx.runDir)).toBe(false);
  });
});
