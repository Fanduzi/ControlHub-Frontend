// input: node fs/os/child_process, fetch, process env
// output: ensureResultContractFixture() — idempotent disposable-MySQL seed of
//   cellTruncated boundary rows + disclosure policies via the real admin API
// pos: T13-A fixture seam — seeds ONLY the dedicated Query E2E Docker MySQL
//   (docker exec as root; password read from the backend fixture state file,
//   never printed) plus disclosure policies through POST/PUT
//   /query-disclosure-policies. No production DB, no backend code changes.
// note: if this file changes, update header and e2e/README.md
//
// Boundary data mirrors the backend T8-B wiring fixture so the browser sees the
// same contract the backend test proved: an 8192-byte cell is NOT truncated,
// 8193 bytes (or a UTF-8 boundary crossing at 8192) IS truncated to a safe
// 8192-byte prefix, and NULL / '' / 'NULL' stay distinct.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PROBE_API_BASE =
  process.env.CONTROLHUB_API_PROXY_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8081";

const CONTAINER =
  process.env.QUERY_E2E_MYSQL_CONTAINER ?? "controlhub-query-e2e-mysql";

// identity-scoped state file written by backend scripts/query-e2e-mysql.sh.
const STATE_DIR =
  process.env.XDG_STATE_HOME ?? path.join(os.homedir(), ".local", "state");
const DEFAULT_ENV_FILE = path.join(
  STATE_DIR,
  "controlhub",
  "query-e2e-mysql--controlhub-query-e2e-mysql:13306:query_e2e:query_e2e_ro.env",
);

/** Deterministic row ids inside query_e2e_aux.t13_cells. */
export const T13_CELLS = {
  exact8192: 1,
  over8193: 2,
  cjkCross: 3,
  emojiCross: 4,
  cjk8190: 5,
  emptyStr: 6,
  sqlNull: 7,
  textNull: 8,
  csvCommaQuote: 9,
  csvNewline: 10,
} as const;

function fixturePassword(): string {
  const fromEnv = process.env.QUERY_E2E_MYSQL_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const envFile = process.env.QUERY_E2E_MYSQL_ENV_FILE ?? DEFAULT_ENV_FILE;
  if (!fs.existsSync(envFile)) {
    throw new Error(
      `Query E2E fixture state not found at ${envFile}; ` +
        `start it with 'make query-e2e-mysql-up' in the backend checkout or set QUERY_E2E_MYSQL_PASSWORD.`,
    );
  }
  const line = fs
    .readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.startsWith("QUERY_E2E_MYSQL_READONLY_PASSWORD="));
  const value = line?.slice("QUERY_E2E_MYSQL_READONLY_PASSWORD=".length).trim();
  if (!value) {
    throw new Error(
      `QUERY_E2E_MYSQL_READONLY_PASSWORD missing in ${envFile}; fixture state is incomplete.`,
    );
  }
  return value;
}

function seedFixtureTables(): void {
  // utf8mb4 REPEAT builds the byte-exact boundary cells in the DB itself —
  // 中 is 3 bytes, 😀 is 4 bytes, so both cross the 8192 cut mid-codepoint.
  const sql = `
use query_e2e_aux;

create table if not exists t13_cells (
  id bigint unsigned not null primary key,
  pad mediumtext character set utf8mb4,
  secret mediumtext character set utf8mb4,
  note varchar(64) character set utf8mb4 not null default '',
  free varchar(64) not null default 'free'
) engine=InnoDB;

insert into t13_cells (id, pad, secret, note, free) values
  (1, repeat('a', 8192), 's', 'edge-8192', 'free'),
  (2, repeat('b', 8193), repeat('s', 8193), 'over-8193', 'free'),
  (3, repeat('中', 2731), 's', 'cjk-cross', 'free'),
  (4, repeat('😀', 2049), 's', 'emoji-cross', 'free'),
  (5, repeat('中', 2730), 's', 'cjk-8190', 'free'),
  (6, '', 's', 'empty-str', 'free'),
  (7, null, 's', 'sql-null', 'free'),
  (8, 'NULL', 's', 'text-null', 'free'),
  (9, 'plain', 's', 'x,"y', 'free'),
  (10, 'plain2', 's', concat('line1', char(10), 'line2'), 'free'),
  (11, 'page2-a', 's', 'p2', 'free'),
  (12, 'page2-b', 's', 'p2', 'free'),
  (13, 'page2-c', 's', 'p2', 'free'),
  (14, 'page2-d', 's', 'p2', 'free'),
  (15, 'page2-e', 's', 'p2', 'free')
on duplicate key update
  pad = values(pad),
  secret = values(secret),
  note = values(note),
  free = values(free);

create table if not exists t13_parent (
  id bigint unsigned not null auto_increment,
  parent_code varchar(32) not null,
  pad mediumtext character set utf8mb4,
  primary key (id),
  unique key uq_t13_parent_code (parent_code)
) engine=InnoDB;

create table if not exists t13_child (
  id bigint unsigned not null auto_increment,
  parent_id bigint unsigned not null,
  child_name varchar(64) not null,
  primary key (id),
  key idx_t13_child_parent (parent_id),
  constraint fk_t13_child_parent foreign key (parent_id)
    references t13_parent (id) on update cascade on delete restrict
) engine=InnoDB;

insert into t13_parent (id, parent_code, pad) values
  (1, 'T13_P1', repeat('w', 9000)),
  (2, 'T13_P2', 'short')
on duplicate key update
  parent_code = values(parent_code),
  pad = values(pad);

insert into t13_child (id, parent_id, child_name) values
  (1, 1, 't13c1'),
  (2, 2, 't13c2')
on duplicate key update
  parent_id = values(parent_id),
  child_name = values(child_name);
`;
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      `MYSQL_PWD=${fixturePassword()}`,
      CONTAINER,
      "mysql",
      "-uroot",
      "--default-character-set=utf8mb4",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
}

type Policy = {
  databaseName: string;
  objectName: string;
  columnName: string;
  mode: "raw_copy_allowed" | "masked_no_copy";
};

const POLICIES: Policy[] = [
  // t13_cells — pad/id/note copyable; secret masked; free intentionally absent.
  ...["id", "pad", "note"].map((columnName) => ({
    databaseName: "query_e2e_aux",
    objectName: "t13_cells",
    columnName,
    mode: "raw_copy_allowed" as const,
  })),
  {
    databaseName: "query_e2e_aux",
    objectName: "t13_cells",
    columnName: "secret",
    mode: "masked_no_copy",
  },
  // t13_parent / t13_child — all projected columns copyable.
  ...["id", "parent_code", "pad"].map((columnName) => ({
    databaseName: "query_e2e_aux",
    objectName: "t13_parent",
    columnName,
    mode: "raw_copy_allowed" as const,
  })),
  ...["id", "parent_id", "child_name"].map((columnName) => ({
    databaseName: "query_e2e_aux",
    objectName: "t13_child",
    columnName,
    mode: "raw_copy_allowed" as const,
  })),
];

async function seedDisclosurePolicies(
  token: string,
  targetResourceId: number,
): Promise<void> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
  // Read the current scope→mode map once: POST only missing scopes and PUT
  // only differing ones (a same-mode PUT is a MySQL no-op → 404 by design).
  const listRes = await fetch(
    `${PROBE_API_BASE}/query-disclosure-policies?targetResourceId=${targetResourceId}`,
    { headers, signal: AbortSignal.timeout(10_000) },
  );
  if (!listRes.ok) {
    throw new Error(
      `list disclosure policies failed: HTTP ${listRes.status}`,
    );
  }
  const listBody = (await listRes.json()) as {
    items?: Array<{
      databaseName: string;
      schemaName?: string;
      objectName: string;
      columnName: string;
      mode: string;
    }>;
  };
  const existing = new Map(
    (listBody.items ?? []).map((p) => [
      `${p.databaseName}|${p.schemaName ?? ""}|${p.objectName}|${p.columnName}`,
      p.mode,
    ]),
  );

  for (const p of POLICIES) {
    const key = `${p.databaseName}||${p.objectName}|${p.columnName}`;
    const mode = existing.get(key);
    if (mode === p.mode) continue;
    const body = JSON.stringify({
      targetResourceId,
      databaseName: p.databaseName,
      schemaName: "",
      objectName: p.objectName,
      columnName: p.columnName,
      mode: p.mode,
    });
    const res = await fetch(`${PROBE_API_BASE}/query-disclosure-policies`, {
      method: mode === undefined ? "POST" : "PUT",
      headers,
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const expected = mode === undefined ? 201 : 204;
    if (res.status !== expected) {
      throw new Error(
        `disclosure policy ${mode === undefined ? "create" : "update"} failed for ${p.objectName}.${p.columnName}: HTTP ${res.status}`,
      );
    }
  }
}

/**
 * Seed the T13-A fixture: boundary-cell tables in the disposable fixture
 * MySQL plus their disclosure policies via the real admin API. Idempotent —
 * safe in beforeAll for every spec that needs it.
 */
export async function ensureResultContractFixture(
  token: string,
  targetResourceId: number,
): Promise<void> {
  seedFixtureTables();
  await seedDisclosurePolicies(token, targetResourceId);
}
