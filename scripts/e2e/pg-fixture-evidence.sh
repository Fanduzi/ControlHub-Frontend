#!/usr/bin/env bash
# input: per-run state dirs under $PG_FIXTURE_STATE_DIR (default .e2e-pg-fixture-state/), git metadata, e2e/backend-fixture.env
# output: sanitized whitelist evidence in $PG_FIXTURE_EVIDENCE_DIR (default e2e-evidence/) — run manifest, assembly identity, fixture/seed logs with credential patterns redacted
# pos: form the uploadable evidence set BEFORE teardown deletes runtime state; secrets/state/cnf/pid/binary files are never copied — whitelist only, and required files fail closed
# note: if this file changes, update e2e/README.md; runs before pg-fixture-down.sh in CI
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BASE_STATE_DIR="${PG_FIXTURE_STATE_DIR:-${REPO_ROOT}/.e2e-pg-fixture-state}"
EVIDENCE_DIR="${PG_FIXTURE_EVIDENCE_DIR:-${REPO_ROOT}/e2e-evidence}"
OWNED_MARKER=".owned-by-e2e-pg-fixture"

note() { printf '[pg-fixture-evidence] %s\n' "$*"; }
die() { printf '[pg-fixture-evidence] FAIL %s\n' "$*" >&2; exit 1; }

mkdir -p "$EVIDENCE_DIR"

# Credential-shape scrub: applied to every byte copied into evidence. Masks
# DSN passwords, keyword secrets, and bearer tokens; 'secret_note' (a column
# name, no '=' separator) is unaffected.
scrub() {
  sed -E \
    -e 's|([A-Za-z0-9_.-]+):[^@/[:space:]]+@tcp|\1:REDACTED@tcp|g' \
    -e 's/(password|passwd|pwd)[=:][^[:space:]"]+/\1=REDACTED/gi' \
    -e 's/(token|secret|jwt|credential)[=:][^[:space:]"]+/\1=REDACTED/gi' \
    -e 's/Bearer[[:space:]]+[A-Za-z0-9._~-]+/Bearer REDACTED/g'
}

copy_scrubbed() {
  local src="$1" dst="$2"
  scrub < "$src" > "$dst"
  # Post-scrub assertion: every credential-shape match must already be a
  # REDACTED placeholder; anything else left over refuses publication.
  if grep -oiE '(password|passwd|pwd|token|secret|jwt|credential)[=:][^[:space:]"]+|Bearer[[:space:]]+[A-Za-z0-9._~-]+' "$dst" \
     | grep -qiv 'REDACTED'; then
    die "scrub incomplete for $src — refusing to publish"
  fi
}

# ── 1. Run manifest — always produced so the evidence dir is never empty ──
{
  echo "generated_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "frontend_sha=$(git -C "$REPO_ROOT" rev-parse HEAD)"
  echo "frontend_tree=$(git -C "$REPO_ROOT" rev-parse 'HEAD^{tree}')"
  echo "backend_sha=$(sed -n 's/^CONTROLHUB_BACKEND_SHA=//p' "${REPO_ROOT}/e2e/backend-fixture.env")"
  echo "backend_tree=$(sed -n 's/^CONTROLHUB_BACKEND_TREE=//p' "${REPO_ROOT}/e2e/backend-fixture.env")"
  echo "e2e_run_id=${E2E_RUN_ID:-<unset>}"
  echo "pg_image=${PG_IMAGE:-postgres:17.10}"
  echo "node=$(node --version 2>/dev/null || echo n/a)"
  echo "go=$(go version 2>/dev/null | awk '{print $3}' || echo n/a)"
  echo "runner_arch=$(uname -m)-$(uname -s)"
} > "${EVIDENCE_DIR}/run-manifest.txt"
note "run-manifest.txt written"

# ── 2. Per-run fixture evidence (whitelist) ─────────────────────────────
failures=0
if [ -d "$BASE_STATE_DIR" ]; then
  for d in "$BASE_STATE_DIR"/*/; do
    [ -f "${d}${OWNED_MARKER}" ] || continue
    rid="$(basename "$d")"
    status="$(sed -n 's/^STATUS=//p' "${d}state.env" | tail -1)"
    # A run that reached STATUS=up must hand over all three artifacts; a
    # failed early run may legitimately have only a subset.
    copied=0
    for f in assembly.json fixture-server.log pg-seed.log; do
      if [ -f "${d}${f}" ]; then
        copy_scrubbed "${d}${f}" "${EVIDENCE_DIR}/${rid}-${f}"
        copied=$((copied + 1))
      elif [ "$status" = "up" ]; then
        printf '[pg-fixture-evidence] FAIL %s\n' "run $rid reached STATUS=up but $f is missing" >&2
        failures=$((failures + 1))
      fi
    done
    if [ "$copied" = 0 ] && [ "$status" != "up" ]; then
      note "run $rid has no publishable fixture logs (status=${status:-unknown})"
    fi
  done
fi

# ── 3. Exclusion self-check: state/secret carriers must never appear ────
for banned in mysql-client.cnf state.env fixture.pid e2e-pg-server .owned-by-e2e-pg-fixture; do
  if find "$EVIDENCE_DIR" -name "$banned" | grep -q .; then
    die "forbidden file $banned present in evidence dir"
  fi
done

[ "$failures" -eq 0 ] || die "$failures required-evidence check(s) failed"
note "evidence collected in $EVIDENCE_DIR ($(find "$EVIDENCE_DIR" -type f | wc -l | tr -d ' ') files)"
