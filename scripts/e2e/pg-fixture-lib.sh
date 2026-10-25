# shellcheck shell=bash

# Resolve the executable a live PID is really running. /proc on Linux,
# `ps -o comm=` elsewhere (returns the path the kernel exec'd — unlike lsof
# txt, whose first entry is not guaranteed to be the binary). Empty output
# means the path could not be determined — callers must treat that as
# "identity unknown", never as a match.
pg_fixture_pid_exe() {
  local pid="$1" exe=""
  if [ -e "/proc/${pid}/exe" ]; then
    exe="$(readlink "/proc/${pid}/exe" 2>/dev/null)"
  else
    exe="$(ps -ww -p "$pid" -o comm= 2>/dev/null | head -1)"
  fi
  printf '%s' "${exe% (deleted)}"
}

# Normalize a path to its physical form (macOS /var -> /private/var etc).
pg_fixture_realpath() {
  local p="$1" dir
  dir="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)" || return 1
  printf '%s/%s' "$dir" "$(basename "$p")"
}

# Signal $1 only when its real executable resolves to $2 — a recorded PID is
# not an identity: a dead fixture's PID may be recycled by a foreign process,
# and a recycled PID must never be signalled. $3 (optional run id) is verified
# against /proc/<pid>/environ when readable. Bounded TERM wait, then KILL, then
# bounded wait — signalling alone never counts as exited.
pg_fixture_stop_pid() {
  local pid="$1" expected_exe="$2" run_id="${3:-}" actual_exe expected_real i
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 0
  actual_exe="$(pg_fixture_pid_exe "$pid")"
  expected_real="$(pg_fixture_realpath "$expected_exe")" || expected_real=""
  # ps/proc may report the path as invoked (through a symlinked parent) —
  # normalize BOTH sides before comparing.
  actual_real="$(pg_fixture_realpath "$actual_exe")" || actual_real=""
  if [ -z "$expected_real" ] || [ -z "$actual_real" ] || [ "$actual_real" != "$expected_real" ]; then
    printf '[pg-fixture] refuse to signal pid=%s: exe "%s" != recorded "%s"\n' \
      "$pid" "${actual_exe:-unknown}" "${expected_real:-$expected_exe}" >&2
    return 1
  fi
  if [ -n "$run_id" ] && [ -r "/proc/${pid}/environ" ]; then
    if ! tr '\0' '\n' < "/proc/${pid}/environ" | grep -qx "E2E_RUN_ID=${run_id}"; then
      printf '[pg-fixture] refuse to signal pid=%s: E2E_RUN_ID mismatch\n' "$pid" >&2
      return 1
    fi
  fi
  kill "$pid" 2>/dev/null || true
  for i in $(seq 1 20); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; return 0; }
    wait "$pid" 2>/dev/null || true
    sleep 0.5
  done
  kill -9 "$pid" 2>/dev/null || true
  for i in $(seq 1 10); do
    kill -0 "$pid" 2>/dev/null || { wait "$pid" 2>/dev/null || true; return 0; }
    wait "$pid" 2>/dev/null || true
    sleep 0.5
  done
  printf '[pg-fixture] pid=%s survived TERM+KILL\n' "$pid" >&2
  return 1
}

# Remove container $1 with explicit classification. Removal succeeds only when
# the daemon confirms it, or a subsequent inspect fails with the precise
# "No such object"/"No such container" response. inspect exit code alone is
# never proof of absence: daemon unreachable, permission, timeout, and unknown
# failures all return 1 with both error texts preserved for diagnosis.
pg_fixture_rm_container() {
  local cid="$1" rm_err inspect_err
  if rm_err="$(docker rm -f "$cid" 2>&1)"; then
    printf '[pg-fixture] removed container %.12s\n' "$cid"
    return 0
  fi
  if inspect_err="$(docker inspect "$cid" 2>&1 >/dev/null)"; then
    printf '[pg-fixture] container %.12s still exists after rm failure (%s)\n' \
      "$cid" "$rm_err" >&2
    return 1
  fi
  if printf '%s' "$inspect_err" | grep -qiE 'no such (object|container)'; then
    printf '[pg-fixture] container %.12s confirmed absent (rm=%s; inspect=NotFound)\n' \
      "$cid" "$rm_err"
    return 0
  fi
  printf '[pg-fixture] cannot classify container %.12s: rm=%s; inspect=%s\n' \
    "$cid" "$rm_err" "$inspect_err" >&2
  return 1
}
