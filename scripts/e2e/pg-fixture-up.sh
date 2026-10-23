#!/usr/bin/env bash
# input: env (see REQUIRED below), e2e/backend-fixture.env, e2e/pg-fixture-seed.sql, docker, mysql client, go toolchain, curl, python3
# output: disposable PG container + seeded labdb/labdb_other + metadata rows + built cmd/e2e-pg-server listener on :${APP_PORT} + per-run state dir for pg-fixture-down.sh
# pos: cold-start the verified T13/T14 PG fixture from a clean runner — ALL input safety checks run before ANY side effect; one run owns one state dir; every identity check fails closed
# note: if this file changes, update e2e/README.md; never echo passwords/DSNs — per-run secrets are masked (GitHub) or kept out of stdout
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/e2e/pg-fixture-lib.sh
. "${REPO_ROOT}/scripts/e2e/pg-fixture-lib.sh"
# PG_FIXTURE_MANIFEST/PG_FIXTURE_SEED exist only as narrow test seams — CI and
# local runs always use the reviewed repo paths.
MANIFEST="${PG_FIXTURE_MANIFEST:-${REPO_ROOT}/e2e/backend-fixture.env}"
SEED_SQL="${PG_FIXTURE_SEED:-${REPO_ROOT}/e2e/pg-fixture-seed.sql}"
BASE_STATE_DIR="${PG_FIXTURE_STATE_DIR:-${REPO_ROOT}/.e2e-pg-fixture-state}"

note() { printf '[pg-fixture-up] %s\n' "$*"; }
die() { printf '[pg-fixture-up] FAIL %s\n' "$*" >&2; exit 1; }
mask() { if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::add-mask::%s\n' "$1"; fi; }

# ── 0. Input precheck — runs entirely before ANY side effect ────────────
# No container, no state dir, no credential file, no metadata SQL may exist
# or execute until every check in this section has passed.
for var in E2E_RUN_ID BACKEND_DIR DATABASE_DSN JWT_SECRET; do
  [ -n "${!var:-}" ] || die "required env $var is not set"
done
printf '%s' "$E2E_RUN_ID" | grep -qE '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' \
  || die "E2E_RUN_ID has unsafe characters"

BACKEND_DIR="$(cd "$BACKEND_DIR" && pwd)"
[ -f "$BACKEND_DIR/cmd/e2e-pg-server/main.go" ] || die "BACKEND_DIR lacks cmd/e2e-pg-server (wrong tree?)"

PINNED_SHA="$(sed -n 's/^CONTROLHUB_BACKEND_SHA=//p' "$MANIFEST" | tr -d '[:space:]')"
PINNED_TREE="$(sed -n 's/^CONTROLHUB_BACKEND_TREE=//p' "$MANIFEST" | tr -d '[:space:]')"
[ "${#PINNED_SHA}" = 40 ] || die "manifest backend SHA missing/not 40 hex"
[ "${#PINNED_TREE}" = 40 ] || die "manifest backend tree missing/not 40 hex"

ACTUAL_SHA="$(git -C "$BACKEND_DIR" rev-parse HEAD)"
ACTUAL_TREE="$(git -C "$BACKEND_DIR" rev-parse 'HEAD^{tree}')"
note "backend HEAD=$ACTUAL_SHA tree=$ACTUAL_TREE"
[ "$ACTUAL_SHA" = "$PINNED_SHA" ] || die "backend HEAD != pinned $PINNED_SHA"
[ "$ACTUAL_TREE" = "$PINNED_TREE" ] || die "backend tree != pinned $PINNED_TREE"
# HEAD/tree equality does not prove a clean worktree: a dirty build would still
# stamp vcs.revision=<pin> and masquerade as the approved object. Refuse it.
[ -z "$(git -C "$BACKEND_DIR" status --porcelain)" ] \
  || die "backend worktree has uncommitted changes — refusing to build an unreviewed binary"

for cmd in docker mysql go curl python3; do
  command -v "$cmd" >/dev/null || die "$cmd not on PATH"
done

# Strict metadata DSN parse — the same safety boundary the backend fixture
# enforces (disposable loopback metadata only), applied BEFORE any mysql call.
# Form: user:pass@tcp(<literal loopback host>:<port>)/<db>?<params>
DSN_RE='^([^:@/[:space:]]+):([^@/[:space:]]*)@tcp\((127\.0\.0\.1|\[::1\]|::1):([0-9]{1,5})\)/([A-Za-z0-9_]+)\?[^[:space:]]*$'
[[ "$DATABASE_DSN" =~ $DSN_RE ]] \
  || die "DATABASE_DSN rejected: must be user:pass@tcp(<literal loopback>:<port>)/<db>?<params> — remote or malformed DSNs are refused before any connection is opened"
META_USER="${BASH_REMATCH[1]}"
META_PW="${BASH_REMATCH[2]}"
META_HOST="${BASH_REMATCH[3]}"
META_PORT="${BASH_REMATCH[4]}"
META_DB="${BASH_REMATCH[5]}"
[ "$META_PORT" -ge 1 ] && [ "$META_PORT" -le 65535 ] 2>/dev/null \
  || die "DATABASE_DSN port out of range"
printf '%s' "$META_DB" | grep -qE '^controlhub_[a-z0-9_]*e2e$' \
  || die "metadata DB $META_DB is not a disposable controlhub_*e2e name"

PG_IMAGE="${PG_IMAGE:-postgres:17.10}"
PG_HOST_PORT="${PG_HOST_PORT:-55432}"
APP_PORT="${APP_PORT:-8080}"
CONTAINER_NAME="${E2E_PG_CONTAINER:-chub-pg-e2e-$(printf '%s' "$E2E_RUN_ID" | tr -c 'A-Za-z0-9-' '-')}"

if command -v lsof >/dev/null 2>&1 && \
   { lsof -nP -iTCP:"$PG_HOST_PORT" -sTCP:LISTEN >/dev/null 2>&1 || \
     lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; }; then
  die "host port $PG_HOST_PORT or $APP_PORT already bound — refusing to adopt a foreign listener"
fi

# ── 1. Exclusive per-run state — refuse stale/live state, never truncate ──
RUN_DIR="${BASE_STATE_DIR}/${E2E_RUN_ID}"
STATE_FILE="${RUN_DIR}/state.env"
LOG_FILE="${RUN_DIR}/fixture-server.log"
if [ -e "$RUN_DIR" ]; then
  die "state dir $RUN_DIR already exists — a previous run still owns it; run scripts/e2e/pg-fixture-down.sh first"
fi
mkdir -p "$BASE_STATE_DIR"
mkdir "$RUN_DIR" 2>/dev/null || die "cannot exclusively create $RUN_DIR"
touch "${RUN_DIR}/.owned-by-e2e-pg-fixture"
{
  echo "E2E_RUN_ID=$E2E_RUN_ID"
  echo "BACKEND_SHA=$PINNED_SHA"
  echo "CONTAINER_NAME=$CONTAINER_NAME"
} > "$STATE_FILE"

# From here on, every failure path converges on bounded cleanup of what this
# run actually registered — the SAME identity/classification rules as
# pg-fixture-down.sh (shared pg-fixture-lib.sh primitives). The original die
# message prints first; cleanup errors are recorded, never overwrite the
# primary cause, and never pretend a cleanup succeeded.
UP_DONE=0
state_get() { sed -n "s/^$1=//p" "$STATE_FILE" | head -1; }
on_exit() {
  rc=$?
  if [ "$UP_DONE" = 1 ]; then return; fi
  note "startup failed — cleaning resources registered by this run"
  clean_failures=0
  rm -f "${RUN_DIR}/mysql-client.cnf" 2>/dev/null || true
  FPID="$(state_get FIXTURE_PID)"
  FEXE="$(state_get FIXTURE_EXE)"
  if [ -n "$FPID" ] && kill -0 "$FPID" 2>/dev/null; then
    pg_fixture_stop_pid "$FPID" "$FEXE" "$E2E_RUN_ID" || clean_failures=$((clean_failures + 1))
  fi
  CID="$(state_get CONTAINER_ID)"
  if [ -n "$CID" ]; then
    pg_fixture_rm_container "$CID" || clean_failures=$((clean_failures + 1))
  fi
  if [ "$clean_failures" -gt 0 ]; then
    echo "STATUS=failed-cleanup-incomplete" >> "$STATE_FILE" 2>/dev/null || true
    note "startup cleanup incomplete ($clean_failures) — state preserved for pg-fixture-down.sh"
  else
    echo "STATUS=failed" >> "$STATE_FILE" 2>/dev/null || true
  fi
  exit "$rc"
}
trap on_exit EXIT

# Per-run secrets: superuser + SELECT-only ro_user. Masked, never printed.
PG_SUPER_PW="$(openssl rand -hex 24)"; mask "$PG_SUPER_PW"
RO_PW="$(openssl rand -hex 24)";       mask "$RO_PW"

# ── 2. Create → register → start (no unregistered resource window) ───────
note "creating $PG_IMAGE container $CONTAINER_NAME (host 127.0.0.1:$PG_HOST_PORT -> 5432)"
CID="$(docker create --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${PG_HOST_PORT}:5432" \
  -e POSTGRES_PASSWORD="$PG_SUPER_PW" \
  "$PG_IMAGE")"
echo "CONTAINER_ID=$CID" >> "$STATE_FILE"
docker start "$CID" >/dev/null

for i in $(seq 1 30); do
  docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "PostgreSQL did not become ready"
  sleep 2
done
note "pg ready: $(docker exec "$CID" psql -U postgres -Atc 'select version()' | cut -c1-60)"

# ── 3. Seed PG objects + SELECT-only role (fail-stop + minimal assertion) ─
docker cp "$SEED_SQL" "$CID":/tmp/pg-fixture-seed.sql
docker exec -e PGPASSWORD="$PG_SUPER_PW" "$CID" \
  psql -U postgres -v ON_ERROR_STOP=1 -v ro_password="$RO_PW" -f /tmp/pg-fixture-seed.sql \
  > "$RUN_DIR/pg-seed.log" 2>&1 || die "pg seed failed (see $RUN_DIR/pg-seed.log)"
PAGING_ROWS="$(docker exec -e PGPASSWORD="$PG_SUPER_PW" "$CID" \
  psql -U postgres -d labdb -Atc 'select count(*) from e2e.paging')"
[ "$PAGING_ROWS" = "60" ] || die "pg seed assertion failed: e2e.paging has $PAGING_ROWS rows, expected 60"
note "pg seed applied (ON_ERROR_STOP, 60 paging rows verified)"

# ── 4. Seed metadata rows (target + credentials + disclosure policies) ──
# Password rides in a dedicated defaults file (--defaults-file REPLACES all
# global/user cnf reads, so a developer's ~/.my.cnf cannot override it — plain
# MYSQL_PWD loses to ~/.my.cnf and -p leaks to ps).
META_CNF="${RUN_DIR}/mysql-client.cnf"
umask 077
printf '[client]\npassword=%s\n' "$META_PW" > "$META_CNF"
umask 022
mask "$META_PW"
MYSQL_CLI=(mysql "--defaults-file=$META_CNF" -h "$META_HOST" -P "$META_PORT" -u "$META_USER" "$META_DB")

"${MYSQL_CLI[@]}" <<'SQL'
DELETE p FROM query_result_disclosure_policies p
  JOIN resources r ON r.id = p.target_resource_id WHERE r.name = 'local-pg-query-dev';
DELETE c FROM query_target_credentials c
  JOIN resources r ON r.id = c.resource_id WHERE r.name = 'local-pg-query-dev';
DELETE pr FROM resource_profiles_database_instance pr
  JOIN resources r ON r.id = pr.resource_id WHERE r.name = 'local-pg-query-dev';
DELETE FROM resources WHERE name = 'local-pg-query-dev';
SQL

"${MYSQL_CLI[@]}" <<SQL
INSERT INTO resources
  (resource_type, resource_subtype, name, display_name, environment_id, owner_id,
   lifecycle_status, health_status, labels, origin)
VALUES
  ('database_instance', 'postgresql', 'local-pg-query-dev', 'Local PostgreSQL Query Dev',
   (SELECT id FROM environments WHERE slug = 'dev'),
   (SELECT id FROM users WHERE email = 'editor@example.com'),
   'running', 'unknown', '{}', 'imported');
SET @pg_rid = LAST_INSERT_ID();
INSERT INTO resource_profiles_database_instance
  (resource_id, engine, version, host, port, role, spec)
VALUES (@pg_rid, 'postgresql', '17', '127.0.0.1', ${PG_HOST_PORT}, 'primary', '{}');
INSERT INTO query_target_credentials
  (resource_id, database_name, default_schema, engine, credential_ref, enabled, environment_policy)
VALUES
  (@pg_rid, 'labdb', 'e2e', 'postgresql', 'PG_LABDB_RO', 1, 'non_prod_only'),
  (@pg_rid, 'labdb_other', 'e2e', 'postgresql', 'PG_OTHER_RO', 1, 'non_prod_only');
INSERT INTO query_result_disclosure_policies
  (target_resource_id, database_name, schema_name, object_name, column_name, mode)
VALUES
  (@pg_rid,'labdb','e2e','child','child_name','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','child','id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','child','parent_id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','child','sort_order','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','big_payload','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','created_at','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','name','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','price','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','items','secret_note','masked_no_copy'),
  (@pg_rid,'labdb','e2e','paging','id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','paging','name','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','parent','code','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','parent','id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e','parent','label','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e_alt','items','id','raw_copy_allowed'),
  (@pg_rid,'labdb','e2e_alt','items','label','raw_copy_allowed'),
  (@pg_rid,'labdb_other','e2e','items','id','raw_copy_allowed'),
  (@pg_rid,'labdb_other','e2e','items','name','raw_copy_allowed');
SQL
SEEDED="$("${MYSQL_CLI[@]}" -N -e "SELECT COUNT(*) FROM query_result_disclosure_policies p JOIN resources r ON r.id = p.target_resource_id WHERE r.name = 'local-pg-query-dev'")"
rm -f "$META_CNF"
[ "$SEEDED" = "19" ] || die "metadata seed assertion failed: $SEEDED disclosure policies, expected 19"
note "metadata seeded (target local-pg-query-dev, 2 credentials, 19 policies)"

# ── 5. Build the fixture listener from the pinned object ────────────────
note "building cmd/e2e-pg-server"
( cd "$BACKEND_DIR" && go build -o "${RUN_DIR}/e2e-pg-server" ./cmd/e2e-pg-server )
BIN_META="$(go version -m "${RUN_DIR}/e2e-pg-server")"
BIN_SHA="$(printf '%s\n' "$BIN_META" | sed -n 's/.*vcs.revision=//p' | head -1)"
[ "$BIN_SHA" = "$PINNED_SHA" ] || die "fixture binary lacks vcs.revision=$PINNED_SHA (got '${BIN_SHA:-<unstamped>}') — build from a real clone, not a linked worktree"
printf '%s\n' "$BIN_META" | grep -q 'vcs.modified=true' \
  && die "fixture binary stamped vcs.modified=true — not the exact approved object"
FIXTURE_EXE="${RUN_DIR}/e2e-pg-server"
note "fixture binary sha256=$(shasum -a 256 "$FIXTURE_EXE" | cut -d' ' -f1) vcs.revision=$BIN_SHA vcs.modified=false"

# ── 6. Start the listener with this run's identity ──────────────────────
env \
  CONTROLHUB_E2E_FIXTURE_MODE=1 \
  E2E_RUN_ID="$E2E_RUN_ID" \
  DATABASE_DSN="$DATABASE_DSN" \
  JWT_SECRET="$JWT_SECRET" \
  APP_PORT="$APP_PORT" \
  CONTROLHUB_QUERY_CREDENTIAL_PG_LABDB_RO="host=127.0.0.1 port=${PG_HOST_PORT} user=ro_user password=${RO_PW} dbname=labdb sslmode=disable" \
  CONTROLHUB_QUERY_CREDENTIAL_PG_OTHER_RO="host=127.0.0.1 port=${PG_HOST_PORT} user=ro_user password=${RO_PW} dbname=labdb_other sslmode=disable" \
  "$FIXTURE_EXE" > "$LOG_FILE" 2>&1 &
FIXTURE_PID=$!
echo "$FIXTURE_PID" > "${RUN_DIR}/fixture.pid"
{
  echo "FIXTURE_PID=$FIXTURE_PID"
  echo "FIXTURE_EXE=$FIXTURE_EXE"
} >> "$STATE_FILE"

for i in $(seq 1 30); do
  curl -fsS "http://localhost:${APP_PORT}/health" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { cat "$LOG_FILE" >&2; die "fixture listener did not become healthy"; }
  sleep 2
done

# ── 7. Assembly identity — fail closed on any mismatch ──────────────────
ASSEMBLY="$(curl -fsS "http://localhost:${APP_PORT}/e2e/assembly")"
printf '%s\n' "$ASSEMBLY" > "${RUN_DIR}/assembly.json"
python3 - "$ASSEMBLY" "$E2E_RUN_ID" "$PINNED_SHA" <<'PY' || die "assembly identity check failed"
import json, sys
a, run_id, sha = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
assert a.get("kind") == "controlhub-e2e-pg-fixture", a
assert a.get("pgEntries") is True, a
assert a.get("runId") == run_id, a
assert a.get("backendSha") == sha, a
PY
note "assembly verified: $ASSEMBLY"
echo "STATUS=up" >> "$STATE_FILE"
note "fixture up — runId=$E2E_RUN_ID backend=$PINNED_SHA pg=$CONTAINER_NAME pid=$FIXTURE_PID"
UP_DONE=1
