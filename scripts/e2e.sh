#!/usr/bin/env bash
# Live end-to-end checks against the running stack. Start it first:
#   DAY1_SALT=<salt> docker compose up -d --build
# Then: scripts/e2e.sh            (BASE_URL defaults to http://localhost:8080)
set -euo pipefail
cd "$(dirname "$0")/.."
node --test tests/e2e/*.e2e.mjs
