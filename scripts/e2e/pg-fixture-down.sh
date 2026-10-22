#!/usr/bin/env bash
# input: state file written by scripts/e2e/pg-fixture-up.sh (PG_FIXTURE_STATE_DIR, default .e2e-pg-fixture-state/)
# output: kills ONLY this run's fixture PID and removes ONLY this run's container by recorded ID, then clears the state
# pos: teardown counterpart — never touches names/prefixes, foreign listeners, or other runs' resources
# note: if this file changes, update e2e/README.md
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STATE_DIR="${PG_FIXTURE_STATE_DIR:-${REPO_ROOT}/.e2e-pg-fixture-state}"

note() { printf '[pg-fixture-down] %s\n' "$*"; }

if [ ! -f "${STATE_DIR}/state.env" ]; then
  note "no state file — nothing owned by a previous up run; nothing to clean"
  exit 0
fi
# shellcheck disable=SC1090
. "${STATE_DIR}/state.env"

if [ -f "${STATE_DIR}/fixture.pid" ]; then
  PID="$(cat "${STATE_DIR}/fixture.pid")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    note "stopped fixture listener pid=$PID"
  fi
fi

if [ -n "${CONTAINER_ID:-}" ]; then
  docker rm -f "$CONTAINER_ID" >/dev/null 2>&1 \
    && note "removed container ${CONTAINER_ID:0:12} (${CONTAINER_NAME:-unnamed})" \
    || note "container ${CONTAINER_ID:0:12} already gone"
fi

rm -rf "$STATE_DIR"
note "teardown complete"
exit 0
