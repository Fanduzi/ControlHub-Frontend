#!/usr/bin/env bash
set -euo pipefail
umask 077

# Only this run's disposable databases and containers are in scope.
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
. "$SCRIPT_DIR/pg-fixture-lib.sh"
fail() { printf '[tidb-fixture] %s\n' "$*" >&2; exit 1; }
[[ "${CONTROLHUB_E2E_FIXTURE_MODE:-}" == 1 ]] || fail 'test-only fixture mode is required'
[[ "${E2E_RUN_ID:-}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$ ]] || fail 'invalid run identity'
[[ "${E2E_TIDB_STATE_DIR:-}" == /* ]] || fail 'set an absolute E2E_TIDB_STATE_DIR'
state="$E2E_TIDB_STATE_DIR/$E2E_RUN_ID"

cleanup() {
  [[ -d "$state" ]] || return 0
  [[ ! -L "$state" && -f "$state/.owned-by-e2e-tidb-fixture" ]] || return 1
  local record id label rc=0
  for record in monitor engine; do
    [[ -f "$state/$record" ]] || continue
    read -r id < "$state/$record" || return 1
    [[ "$id" =~ ^[0-9a-f]{64}$ ]] || return 1
    if label=$(docker inspect --format '{{ index .Config.Labels "controlhub.e2e.run" }}' "$id" 2>"$state/inspect.log"); then
      [[ "$label" == "$E2E_RUN_ID" ]] || return 1
    elif ! grep -qE 'No such (object|container)' "$state/inspect.log"; then
      return 1
    fi
    pg_fixture_rm_container "$id" || rc=1
  done
  [[ "$rc" == 0 ]] || return "$rc"
  rm -f -- "$state"/{.owned-by-e2e-tidb-fixture,monitor,engine,inspect.log,metadata.cnf,runtime.env}
  rmdir -- "$state"
}

case "${1:-}" in
  down) cleanup || fail 'could not clean owned TiDB resources'; exit ;;
  up) ;;
  *) fail 'usage: tidb-fixture.sh up|down' ;;
esac

# The host and DB guard run before Docker or MySQL sees any input.
dsn_re='^([A-Za-z0-9_]+):([A-Za-z0-9_]+)@tcp\(127\.0\.0\.1:([0-9]{1,5})\)/(controlhub_[a-z0-9_]*e2e)\?[^[:space:]]*$'
[[ "${DATABASE_DSN:-}" =~ $dsn_re ]] || fail 'metadata must be a disposable controlhub_*e2e database on loopback'
meta_user="${BASH_REMATCH[1]}" meta_pw="${BASH_REMATCH[2]}" meta_port="${BASH_REMATCH[3]}" meta_db="${BASH_REMATCH[4]}"
(( 10#$meta_port > 0 && 10#$meta_port <= 65535 )) || fail 'invalid metadata port'
for cmd in docker mysql openssl; do command -v "$cmd" >/dev/null || fail "$cmd not on PATH"; done
mkdir -p -- "$E2E_TIDB_STATE_DIR"
mkdir -- "$state" || fail 'run state already exists'
touch "$state/.owned-by-e2e-tidb-fixture"
trap 'rc=$?; cleanup || printf "TiDB cleanup failed; run state retained\n" >&2; exit "$rc"' EXIT

engine=$(docker create --label "controlhub.e2e.run=$E2E_RUN_ID" -p 127.0.0.1::4000 pingcap/tidb:v8.5.0 \
  --store=unistore --path=/tmp/tidb-e2e --host=0.0.0.0 -P=4000)
printf '%s\n' "$engine" > "$state/engine"
docker start "$engine" >/dev/null
monitor=$(docker create --label "controlhub.e2e.run=$E2E_RUN_ID" --network "container:$engine" \
  --tmpfs /var/lib/mysql --entrypoint sleep mysql:8.4.10 infinity)
printf '%s\n' "$monitor" > "$state/monitor"
docker start "$monitor" >/dev/null
tidb() { docker exec -i "$monitor" mysql --no-defaults -h 127.0.0.1 -P 4000 -uroot "$@"; }
for ((i=0; i<30; i++)); do
  if tidb -N -e 'SELECT VERSION()' 2>/dev/null | grep -Fq TiDB-v8.5.0; then break; fi
  sleep 1
done
tidb -N -e 'SELECT VERSION()' | grep -F TiDB-v8.5.0
published=$(docker port "$engine" 4000/tcp)
[[ "$published" =~ ^127\.0\.0\.1:([0-9]+)$ ]] || fail 'unexpected TiDB bind address'
port="${BASH_REMATCH[1]}"
ro_pw=$(openssl rand -hex 24)
cred="tidb_e2e_ro:$ro_pw@tcp(127.0.0.1:$port)/tidb_e2e?parseTime=true&collation=utf8mb4_bin&tidb_enable_noop_functions=ON"
if [[ -n "${GITHUB_ACTIONS:-}" ]]; then printf '::add-mask::%s\n' "$ro_pw" "$cred"; fi
{
  printf '%s\n' 'CREATE DATABASE tidb_e2e;' "CREATE USER 'tidb_e2e_ro'@'%' IDENTIFIED BY '$ro_pw';" "GRANT SELECT ON tidb_e2e.* TO 'tidb_e2e_ro'@'%';"
  printf '%s\n' 'CREATE TABLE tidb_e2e.items (id BIGINT PRIMARY KEY, name VARCHAR(64), secret_note VARCHAR(64));'
  printf '%s\n' "INSERT INTO tidb_e2e.items VALUES (1,'alpha','private-alpha'),(2,'beta','private-beta'),(3,'gamma','private-gamma'),(4,'delta','private-delta'),(5,'epsilon','private-epsilon'),(6,'zeta','private-zeta');"
  printf '%s\n' 'CREATE TABLE tidb_e2e.slow_items (id BIGINT PRIMARY KEY, note VARCHAR(128));' "INSERT INTO tidb_e2e.slow_items VALUES (1,'note-1');"
  for ((i=0; i<19; i++)); do
    printf 'INSERT INTO tidb_e2e.slow_items SELECT id + %s, CONCAT(note, %s) FROM tidb_e2e.slow_items;\n' "$((1<<i))" "$i"
  done
} | tidb >/dev/null
[[ "$(tidb -N -e 'SELECT COUNT(*) FROM tidb_e2e.slow_items')" == 524288 ]] || fail 'TiDB load seed incomplete'

printf '[client]\npassword=%s\n' "$meta_pw" > "$state/metadata.cnf"
mysql --defaults-file="$state/metadata.cnf" -h 127.0.0.1 -P "$meta_port" -u "$meta_user" "$meta_db" <<SQL
START TRANSACTION;
INSERT INTO resources (resource_type,resource_subtype,name,display_name,environment_id,owner_id,lifecycle_status,health_status,labels,origin)
VALUES ('database_instance','tidb','local-tidb-query-dev','Local TiDB Query Dev',(SELECT id FROM environments WHERE slug='dev'),(SELECT id FROM users WHERE email='editor@example.com'),'running','unknown','{}','imported');
SET @rid=LAST_INSERT_ID();
INSERT INTO resource_profiles_database_instance (resource_id,engine,version,host,port,role,spec)
VALUES (@rid,'tidb','8.5.0','127.0.0.1',$port,'primary','{}');
INSERT INTO query_target_credentials (resource_id,database_name,default_schema,engine,credential_ref,enabled,environment_policy)
VALUES (@rid,'','','tidb','TIDB_E2E_RO',1,'non_prod_only');
INSERT INTO query_result_disclosure_policies (target_resource_id,database_name,schema_name,object_name,column_name,mode)
VALUES (@rid,'tidb_e2e','','items','id','raw_copy_allowed'),(@rid,'tidb_e2e','','items','name','raw_copy_allowed'),(@rid,'tidb_e2e','','items','secret_note','masked_no_copy'),(@rid,'tidb_e2e','','slow_items','id','raw_copy_allowed'),(@rid,'tidb_e2e','','slow_items','note','raw_copy_allowed');
COMMIT;
SQL
rm -f -- "$state/metadata.cnf"
printf '%s\n' "CONTROLHUB_QUERY_CREDENTIAL_TIDB_E2E_RO=$cred" "E2E_TIDB_MONITOR_CONTAINER=$monitor" > "$state/runtime.env"
trap - EXIT
printf '[tidb-fixture] seeded TiDB v8.5.0 and registered owned containers for %s\n' "$E2E_RUN_ID"
