#!/usr/bin/env bash
set -euo pipefail
export PATH="/workspace/toolchains/node-22.22.0/bin:${PATH}"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"
[[ -f package.json ]] || { echo "ensure-stack FAIL: bad REPO_ROOT=$REPO_ROOT" >&2; exit 1; }

RUN_ID="${RUN_ID:-manual-$(date +%Y%m%d-%H%M%S)}"
RUN_DIR="/tmp/controlhub-console-verify/${RUN_ID}"
EVIDENCE_DIR="${RUN_DIR}/evidence"
mkdir -p "$EVIDENCE_DIR"

if ! (echo >/dev/tcp/127.0.0.1/3318) >/dev/null 2>&1; then
  echo "ensure-stack FAIL: MySQL not listening on 127.0.0.1:3318" >&2
  exit 1
fi

health="$(curl -fsS --max-time 3 http://127.0.0.1:8080/health 2>/dev/null || true)"
if [[ "$health" != *'"status":"ok"'* && "$health" != *'"status": "ok"'* ]]; then
  echo "ensure-stack FAIL: BE /health not ok (got: ${health:-empty})" >&2
  exit 1
fi

[[ -d node_modules ]] || { echo "ensure-stack FAIL: node_modules missing — npm ci" >&2; exit 1; }
[[ -f .env.local ]] || { echo "ensure-stack FAIL: .env.local missing" >&2; exit 1; }

STARTED_FE=0
if curl -fsS --max-time 2 -o /dev/null http://localhost:3000/login 2>/dev/null; then
  echo "ensure-stack: FE already up on :3000 (shared; cleanup will not kill it)" >&2
  : > "${RUN_DIR}/fe.shared"
else
  if (echo >/dev/tcp/127.0.0.1/3000) >/dev/null 2>&1; then
    echo "ensure-stack FAIL: :3000 occupied but /login not ready" >&2
    exit 1
  fi
  nohup npm run dev >"${RUN_DIR}/fe.log" 2>&1 &
  echo $! >"${RUN_DIR}/fe.pid"
  STARTED_FE=1
  for i in $(seq 1 60); do
    if curl -fsS --max-time 2 -o /dev/null http://localhost:3000/login 2>/dev/null; then
      break
    fi
    sleep 2
    if [[ $i -eq 60 ]]; then
      echo "ensure-stack FAIL: FE not ready" >&2
      exit 1
    fi
  done
fi

echo "export RUN_ID=$(printf %q "$RUN_ID")"
echo "export RUN_DIR=$(printf %q "$RUN_DIR")"
echo "export EVIDENCE_DIR=$(printf %q "$EVIDENCE_DIR")"
echo "export CONTROLHUB_FRONTEND_URL=http://localhost:3000"
echo "export PATH=$(printf %q "/workspace/toolchains/node-22.22.0/bin:${PATH}")"
echo "ensure-stack OK (started_fe=${STARTED_FE})" >&2
