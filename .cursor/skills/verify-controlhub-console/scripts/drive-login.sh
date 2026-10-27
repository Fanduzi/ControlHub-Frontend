#!/usr/bin/env bash
set -euo pipefail
export PATH="/workspace/toolchains/node-22.22.0/bin:${PATH}"
REPO_ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
cd "$REPO_ROOT"
: "${RUN_DIR:?RUN_DIR unset — eval ensure-stack.sh first}"
: "${EVIDENCE_DIR:?EVIDENCE_DIR unset}"
mkdir -p "$EVIDENCE_DIR"
EMAIL_FILE="${CONTROLHUB_QA_EMAIL_FILE:-/workspace/controlhub-qa-login.email}"
PASS_FILE="${CONTROLHUB_QA_PASS_FILE:-/workspace/controlhub-qa-login.pass}"
BASE_URL="${CONTROLHUB_FRONTEND_URL:-http://localhost:3000}"
OUT_PNG="${EVIDENCE_DIR}/login-overview.png"
OUT_TXT="${EVIDENCE_DIR}/login-result.txt"
[[ -f "$EMAIL_FILE" && -f "$PASS_FILE" ]] || { echo "drive-login FAIL: credential files missing" >&2; exit 1; }
if ! node -e "require('playwright')" 2>/dev/null; then
  echo "drive-login FAIL: playwright package missing — npm ci" >&2
  exit 1
fi
export EMAIL_FILE PASS_FILE BASE_URL OUT_PNG OUT_TXT
node "$(dirname "$0")/drive-login.mjs"
