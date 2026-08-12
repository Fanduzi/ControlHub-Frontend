#!/usr/bin/env bash
# input: npm run dev, CONTROLHUB_API_BASE_URL, CONTROLHUB_API_PROXY_URL, CONTROLHUB_BFF_* env
# output: Next.js dev server for E2E with Console BFF local-development configuration
# pos: E2E dev-server wrapper filtering the single known Node v22 TransformStream stderr race
# note: if this file changes, update header and e2e/harness/README.md
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
# Browser requests use same-origin `/api/proxy`. Server-side fetches point at
# the isolated E2E backend target through the proxy on port 8081.
#
# Console BFF (38X-1C) local-development configuration:
# - explicit fixed dev sealing key (never used outside local E2E/dev)
# - one configured Console Origin matching the dev server
# - explicit controlled non-Secure cookie exception (local HTTP only)
CONTROLHUB_API_BASE_URL=http://localhost:8081 \
CONTROLHUB_API_PROXY_URL=http://localhost:8081 \
CONTROLHUB_BFF_SESSION_KEY=nyx+UbikPW8MHio7TF1uf4CRorPE1eb3CBkqO0xdbn8= \
CONTROLHUB_BFF_CONSOLE_ORIGIN=http://localhost:3100 \
CONTROLHUB_BFF_SECURE_COOKIES=false \
npm run dev -- "$@" 2> >(grep -v --line-buffered 'controller\[kState\]\.transformAlgorithm')
