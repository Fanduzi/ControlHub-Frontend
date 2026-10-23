#!/usr/bin/env bash
# input: per-run state dir written by scripts/e2e/pg-fixture-up.sh (BASE=$PG_FIXTURE_STATE_DIR, default .e2e-pg-fixture-state/<runId>/)
# output: kills ONLY this run's verified fixture PID (exe-identity checked, bounded wait) and removes ONLY this run's container by recorded ID, then clears ONLY the owned state dir
# pos: teardown counterpart — state is parsed key-by-key (never sourced), container errors are classified (NotFound=idempotent vs daemon=fail), any cleanup failure preserves state and exits non-zero
# note: if this file changes, update e2e/README.md
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_STATE_DIR="${PG_FIXTURE_STATE_DIR:-${REPO_ROOT}/.e2e-pg-fixture-state}"
OWNED_MARKER=".owned-by-e2e-pg-fixture"

note() { printf '[pg-fixture-down] %s\n' "$*"; }
fail() { printf '[pg-fixture-down] FAIL %s\n' "$*" >&2; }

# ── Resolve this run's state dir ─────────────────────────────────────────
if [ -n "${E2E_RUN_ID:-}" ]; then
  RUN_ID_SAFE="$(printf '%s' "$E2E_RUN_ID" | tr -c 'A-Za-z0-9._-' '-')"
  RUN_DIR="${BASE_STATE_DIR}/${RUN_ID_SAFE}"
else
  RUN_DIR=""
  found=0
  if [ -d "$BASE_STATE_DIR" ]; then
    for d in "$BASE_STATE_DIR"/*/; do
      [ -f "${d}${OWNED_MARKER}" ] || continue
      found=$((found + 1))
      RUN_DIR="${d%/}"
    done
  fi
  if [ "$found" -gt 1 ]; then
    fail "multiple run state dirs under $BASE_STATE_DIR — set E2E_RUN_ID to disambiguate"
    exit 1
  fi
fi

if [ -z "${RUN_DIR:-}" ] || [ ! -f "${RUN_DIR}/state.env" ]; then
  note "no state for this run — nothing owned; nothing to clean"
  exit 0
fi
[ -f "${RUN_DIR}/${OWNED_MARKER}" ] \
  || { fail "state dir $RUN_DIR lacks ownership marker — refusing to clean unknown files"; exit 1; }

# Normalize to physical paths: state dirs may sit under symlinked parents
# (e.g. macOS /var -> /private/var) while process exe paths resolve physically.
RUN_DIR="$(cd "$RUN_DIR" && pwd -P)"
BASE_STATE_DIR="$(cd "$BASE_STATE_DIR" && pwd -P)"

# Parse state key-by-key; never source — state must not become a code path.
state_get() { sed -n "s/^$1=//p" "${RUN_DIR}/state.env" | head -1; }
CID="$(state_get CONTAINER_ID)"
CNAME="$(state_get CONTAINER_NAME)"
FPID="$(state_get FIXTURE_PID)"
FEXE="$(state_get FIXTURE_EXE)"

[ -z "$FPID" ] || printf '%s' "$FPID" | grep -qE '^[0-9]+$' \
  || { fail "recorded FIXTURE_PID is malformed"; exit 1; }
[ -z "$CID" ] || printf '%s' "$CID" | grep -qE '^[0-9a-f]{12,64}$' \
  || { fail "recorded CONTAINER_ID is malformed"; exit 1; }
if [ -n "$FEXE" ]; then
  FEXE="$(cd "$(dirname "$FEXE")" 2>/dev/null && pwd -P)/$(basename "$FEXE")"
fi

failures=0

# ── 1. Listener PID — verify executable identity before signalling ───────
pid_exe() {
  local pid="$1" exe=""
  if [ -e "/proc/${pid}/exe" ]; then
    exe="$(readlink "/proc/${pid}/exe" 2>/dev/null)"
  else
    exe="$(lsof -a -p "$pid" -d txt -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)"
  fi
  printf '%s' "${exe% (deleted)}"
}

if [ -n "$FPID" ] && kill -0 "$FPID" 2>/dev/null; then
  ACTUAL_EXE="$(pid_exe "$FPID")"
  if [ -n "$FEXE" ] && [ "$ACTUAL_EXE" = "$FEXE" ]; then
    kill "$FPID" 2>/dev/null || true
    alive=0
    for _ in $(seq 1 20); do
      kill -0 "$FPID" 2>/dev/null || { alive=1; break; }
      sleep 0.5
    done
    if [ "$alive" = 0 ]; then
      kill -9 "$FPID" 2>/dev/null || true
      for _ in $(seq 1 10); do
        kill -0 "$FPID" 2>/dev/null || { alive=1; break; }
        sleep 0.5
      done
    fi
    if [ "$alive" = 1 ]; then
      note "stopped fixture listener pid=$FPID"
    else
      fail "fixture listener pid=$FPID survived TERM+KILL — state preserved"
      failures=$((failures + 1))
    fi
  else
    fail "pid=$FPID alive but exe '${ACTUAL_EXE:-unknown}' != recorded '$FEXE' — refusing to signal a foreign process; state preserved"
    failures=$((failures + 1))
  fi
fi

# ── 2. Container — classify removal errors, only NotFound is idempotent ──
if [ -n "$CID" ]; then
  if inspect_err="$(docker inspect "$CID" 2>&1 >/dev/null)"; then
    if ! rm_err="$(docker rm -f "$CID" 2>&1)"; then
      if docker inspect "$CID" >/dev/null 2>&1; then
        fail "docker rm -f $CID failed: $rm_err — container still exists; state preserved"
        failures=$((failures + 1))
      else
        note "container ${CID:0:12} removed (rm reported error but container is gone)"
      fi
    else
      note "removed container ${CID:0:12} (${CNAME:-unnamed})"
    fi
  elif printf '%s' "$inspect_err" | grep -qiE 'no such (object|container)'; then
    note "container ${CID:0:12} already gone"
  else
    fail "docker inspect $CID failed (daemon/permission?): $inspect_err — cannot classify; state preserved"
    failures=$((failures + 1))
  fi
fi

# ── 3. Secrets + state — removed only when every owned cleanup succeeded ─
rm -f "${RUN_DIR}/mysql-client.cnf" 2>/dev/null || true

if [ "$failures" -gt 0 ]; then
  fail "teardown incomplete ($failures failure(s)) — state dir $RUN_DIR preserved for retry/diagnosis"
  exit 1
fi

case "$RUN_DIR" in
  "${BASE_STATE_DIR}"/*) ;;
  *) fail "state dir $RUN_DIR escapes $BASE_STATE_DIR — refusing rm"; exit 1 ;;
esac
rm -rf "$RUN_DIR"
rmdir "$BASE_STATE_DIR" 2>/dev/null || true
note "teardown complete"
exit 0
