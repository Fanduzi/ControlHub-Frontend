#!/usr/bin/env bash
set -euo pipefail
export PATH="/workspace/toolchains/node-22.22.0/bin:${PATH}"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"
fail() { echo "doctor FAIL: $*" >&2; exit 1; }

node_v="$(node -v 2>/dev/null || true)"
[[ "$node_v" == v22.22.* ]] || fail "need Node v22.22.x, got ${node_v:-none}"
[[ -f .env.local ]] || fail ".env.local missing"
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://localhost:3000/login || echo 000)"
[[ "$code" == "200" ]] || fail "FE /login HTTP ${code}"
health="$(curl -fsS --max-time 5 http://127.0.0.1:8080/health || true)"
[[ "$health" == *'"status":"ok"'* || "$health" == *'"status": "ok"'* ]] || fail "BE /health: ${health:-empty}"
echo "doctor OK node=${node_v} fe_login=200 be_health=ok"
