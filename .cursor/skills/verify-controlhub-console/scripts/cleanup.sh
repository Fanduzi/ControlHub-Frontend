#!/usr/bin/env bash
set -euo pipefail
: "${RUN_DIR:?RUN_DIR unset}"
if [[ -f "${RUN_DIR}/fe.pid" ]]; then
  pid="$(cat "${RUN_DIR}/fe.pid")"
  if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
    echo "cleanup: stopped FE pid ${pid}"
  else
    echo "cleanup: FE pid ${pid} already gone"
  fi
  rm -f "${RUN_DIR}/fe.pid"
elif [[ -f "${RUN_DIR}/fe.shared" ]]; then
  echo "cleanup: shared FE — left running"
else
  echo "cleanup: no FE pid recorded"
fi
if [[ -d "${RUN_DIR}/evidence" ]]; then
  echo "cleanup: evidence kept at ${RUN_DIR}/evidence"
else
  echo "cleanup: WARNING no evidence dir"
fi
