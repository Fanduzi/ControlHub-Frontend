#!/usr/bin/env bash
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/e2e/pg-fixture-lib.sh
. "${REPO_ROOT}/scripts/e2e/pg-fixture-lib.sh"
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
SRUN_ID="$(state_get E2E_RUN_ID)"

[ -z "$FPID" ] || printf '%s' "$FPID" | grep -qE '^[0-9]+$' \
  || { fail "recorded FIXTURE_PID is malformed"; exit 1; }
[ -z "$CID" ] || printf '%s' "$CID" | grep -qE '^[0-9a-f]{12,64}$' \
  || { fail "recorded CONTAINER_ID is malformed"; exit 1; }

failures=0

# ── 1. Listener PID — verified executable identity before signalling ─────
if [ -n "$FPID" ] && kill -0 "$FPID" 2>/dev/null; then
  if pg_fixture_stop_pid "$FPID" "$FEXE" "$SRUN_ID"; then
    note "stopped fixture listener pid=$FPID"
  else
    fail "fixture listener pid=$FPID could not be verified/terminated — state preserved"
    failures=$((failures + 1))
  fi
fi

# ── 2. Container — classified removal, only confirmed absence is idempotent
if [ -n "$CID" ]; then
  if pg_fixture_rm_container "$CID"; then
    note "container ${CID:0:12} (${CNAME:-unnamed}) handled"
  else
    fail "container ${CID:0:12} removal unconfirmed — state preserved"
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
