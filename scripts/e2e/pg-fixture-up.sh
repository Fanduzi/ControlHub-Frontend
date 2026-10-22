#!/usr/bin/env bash
# input: env (see REQUIRED below), e2e/backend-fixture.env, e2e/pg-fixture-seed.sql, docker, mysql client, go toolchain, curl
# output: disposable PG container + seeded labdb/labdb_other + metadata rows + built cmd/e2e-pg-server listener on :${APP_PORT} + state file for pg-fixture-down.sh
# pos: cold-start the verified T13/T14 PG fixture from a clean runner — one run owns one container, one PID, one state file; every identity check fails closed
# note: if this file changes, update e2e/README.md; never echo passwords/DSNs — per-run secrets are masked (GitHub) or kept out of stdout
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MANIFEST="${REPO_ROOT}/e2e/backend-fixture.env"
SEED_SQL="${REPO_ROOT}/e2e/pg-fixture-seed.sql"
STATE_DIR="${PG_FIXTURE_STATE_DIR:-${REPO_ROOT}/.e2e-pg-fixture-state}"
mkdir -p "$STATE_DIR"
STATE_FILE="${STATE_DIR}/state.env"
LOG_FILE="${STATE_DIR}/fixture-server.log"
: > "$STATE_FILE"

note() { printf '[pg-fixture-up] %s\n' "$*"; }
die() { printf '[pg-fixture-up] FAIL %s\n' "$*" >&2; exit 1; }
mask() { if [ -n "${GITHUB_ACTIONS:-}" ]; then printf '::add-mask::%s\n' "$1"; fi; }

# ── 1. Required inputs + pinned manifest ────────────────────────────────
for var in E2E_RUN_ID BACKEND_DIR DATABASE_DSN JWT_SECRET; do
  [ -n "${!var:-}" ] || die "required env $var is not set"
done
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

# ── 2. Run identity + resources ─────────────────────────────────────────
PG_IMAGE="${PG_IMAGE:-postgres:17.10}"
PG_HOST_PORT="${PG_HOST_PORT:-55432}"
APP_PORT="${APP_PORT:-8080}"
CONTAINER_NAME="${E2E_PG_CONTAINER:-chub-pg-e2e-$(printf '%s' "$E2E_RUN_ID" | tr -c 'A-Za-z0-9-' '-')}"

for cmd in docker mysql go curl; do
  command -v "$cmd" >/dev/null || die "$cmd not on PATH"
done
if command -v lsof >/dev/null 2>&1 && \
   { lsof -nP -iTCP:"$PG_HOST_PORT" -sTCP:LISTEN >/dev/null 2>&1 || \
     lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; }; then
  die "host port $PG_HOST_PORT or $APP_PORT already bound — refusing to adopt a foreign listener"
fi

# Per-run secrets: superuser + SELECT-only ro_user. Masked, never printed.
PG_SUPER_PW="$(openssl rand -hex 24)"; mask "$PG_SUPER_PW"
RO_PW="$(openssl rand -hex 24)";       mask "$RO_PW"

note "starting $PG_IMAGE container $CONTAINER_NAME (host 127.0.0.1:$PG_HOST_PORT -> 5432)"
CID="$(docker run -d --name "$CONTAINER_NAME" \
  -p "127.0.0.1:${PG_HOST_PORT}:5432" \
  -e POSTGRES_PASSWORD="$PG_SUPER_PW" \
  "$PG_IMAGE")"
echo "CONTAINER_ID=$CID" >> "$STATE_FILE"
echo "CONTAINER_NAME=$CONTAINER_NAME" >> "$STATE_FILE"

cleanup_on_error() {
  note "startup failed — removing owned resources"
  docker rm -f "$CID" >/dev/null 2>&1 || true
  [ -f "${STATE_DIR}/fixture.pid" ] && kill "$(cat "${STATE_DIR}/fixture.pid")" 2>/dev/null || true
}
trap cleanup_on_error ERR

for i in $(seq 1 30); do
  docker exec "$CID" pg_isready -U postgres >/dev/null 2>&1 && break
  [ "$i" = 30 ] && die "PostgreSQL did not become ready"
  sleep 2
done
note "pg ready: $(docker exec "$CID" psql -U postgres -Atc 'select version()' | cut -c1-60)"

# ── 3. Seed PG objects + SELECT-only role ───────────────────────────────
docker cp "$SEED_SQL" "$CID":/tmp/pg-fixture-seed.sql
docker exec -e PGPASSWORD="$PG_SUPER_PW" "$CID" \
  psql -U postgres -v ro_password="$RO_PW" -f /tmp/pg-fixture-seed.sql \
  > "$STATE_DIR/pg-seed.log" 2>&1 || die "pg seed failed (see $STATE_DIR/pg-seed.log)"
note "pg seed applied"

# ── 4. Seed metadata rows (target + credentials + disclosure policies) ──
case "$DATABASE_DSN" in
  *'@tcp('*')/'*'?parseTime'*) ;;
  *) die "DATABASE_DSN not in expected MySQL DSN form" ;;
esac
META_DB="$(printf '%s' "$DATABASE_DSN" | sed -n 's|.*/\([^?]*\)?.*|\1|p')"
case "$META_DB" in controlhub_*_e2e) ;; *) die "metadata DB $META_DB is not a disposable controlhub_*_e2e name" ;; esac
META_USER="$(printf '%s' "$DATABASE_DSN" | sed -n 's|^\([^:]*\):.*|\1|p')"
META_HOSTPORT="$(printf '%s' "$DATABASE_DSN" | sed -n 's|.*@tcp(\([^)]*\)).*|\1|p')"
META_HOST="${META_HOSTPORT%%:*}"
META_PORT="${META_HOSTPORT##*:}"
# Password rides in a dedicated defaults file (--defaults-file REPLACES all
# global/user cnf reads, so a developer's ~/.my.cnf cannot override it — plain
# MYSQL_PWD loses to ~/.my.cnf and -p leaks to ps).
META_PW="$(printf '%s' "$DATABASE_DSN" | sed -n 's|^[^:]*:\([^@]*\)@.*|\1|p')"
META_CNF="${STATE_DIR}/mysql-client.cnf"
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
rm -f "$META_CNF"
note "metadata seeded (target local-pg-query-dev, 2 credentials, 19 policies)"

# ── 5. Build the fixture listener from the pinned object ────────────────
note "building cmd/e2e-pg-server"
( cd "$BACKEND_DIR" && go build -o "${STATE_DIR}/e2e-pg-server" ./cmd/e2e-pg-server )
BIN_SHA="$(go version -m "${STATE_DIR}/e2e-pg-server" | sed -n 's/.*vcs.revision=//p' | head -1)"
[ "$BIN_SHA" = "$PINNED_SHA" ] || die "fixture binary lacks vcs.revision=$PINNED_SHA (got '${BIN_SHA:-<unstamped>}') — build from a real clone, not a linked worktree"
note "fixture binary sha256=$(shasum -a 256 "${STATE_DIR}/e2e-pg-server" | cut -d' ' -f1) vcs.revision=$BIN_SHA"

# ── 6. Start the listener with this run's identity ──────────────────────
env \
  CONTROLHUB_E2E_FIXTURE_MODE=1 \
  E2E_RUN_ID="$E2E_RUN_ID" \
  DATABASE_DSN="$DATABASE_DSN" \
  JWT_SECRET="$JWT_SECRET" \
  APP_PORT="$APP_PORT" \
  CONTROLHUB_QUERY_CREDENTIAL_PG_LABDB_RO="host=127.0.0.1 port=${PG_HOST_PORT} user=ro_user password=${RO_PW} dbname=labdb sslmode=disable" \
  CONTROLHUB_QUERY_CREDENTIAL_PG_OTHER_RO="host=127.0.0.1 port=${PG_HOST_PORT} user=ro_user password=${RO_PW} dbname=labdb_other sslmode=disable" \
  "${STATE_DIR}/e2e-pg-server" > "$LOG_FILE" 2>&1 &
FIXTURE_PID=$!
echo "$FIXTURE_PID" > "${STATE_DIR}/fixture.pid"
echo "FIXTURE_PID=$FIXTURE_PID" >> "$STATE_FILE"

for i in $(seq 1 30); do
  curl -fsS "http://localhost:${APP_PORT}/health" >/dev/null 2>&1 && break
  [ "$i" = 30 ] && { cat "$LOG_FILE" >&2; die "fixture listener did not become healthy"; }
  sleep 2
done

# ── 7. Assembly identity — fail closed on any mismatch ──────────────────
ASSEMBLY="$(curl -fsS "http://localhost:${APP_PORT}/e2e/assembly")"
printf '%s\n' "$ASSEMBLY" > "${STATE_DIR}/assembly.json"
python3 - "$ASSEMBLY" "$E2E_RUN_ID" "$PINNED_SHA" <<'PY' || die "assembly identity check failed"
import json, sys
a, run_id, sha = json.loads(sys.argv[1]), sys.argv[2], sys.argv[3]
assert a.get("kind") == "controlhub-e2e-pg-fixture", a
assert a.get("pgEntries") is True, a
assert a.get("runId") == run_id, a
assert a.get("backendSha") == sha, a
PY
note "assembly verified: $ASSEMBLY"
note "fixture up — runId=$E2E_RUN_ID backend=$PINNED_SHA pg=$CONTAINER_NAME pid=$FIXTURE_PID"
trap - ERR
