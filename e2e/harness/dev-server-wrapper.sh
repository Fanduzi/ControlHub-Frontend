#!/usr/bin/env bash
# Wraps the Next.js dev server to filter a known Node.js v22 stderr noise.
#
# Node v22 has a TransformStream race condition (node#62036) that sporadically
# emits: TypeError: controller[kState].transformAlgorithm is not a function
#
# This wrapper passes ALL stderr through unchanged EXCEPT lines matching that
# exact pattern.  Other errors, warnings, and compilation messages are preserved.
set -euo pipefail

# Forward args to the real dev server, filtering stderr line-by-line.
# Only the single known Node v22 stream race condition is suppressed.
#
# Browser requests use same-origin /__api (via NEXT_PUBLIC_API_BASE_URL).
# Server-side fetches and the rewrite target point at the E2E proxy (8081).
CONTROLHUB_API_BASE_URL=http://localhost:8081 \
CONTROLHUB_API_PROXY_URL=http://localhost:8081 \
NEXT_PUBLIC_API_BASE_URL=/__api \
npm run dev -- "$@" 2> >(grep -v --line-buffered 'controller\[kState\]\.transformAlgorithm')
