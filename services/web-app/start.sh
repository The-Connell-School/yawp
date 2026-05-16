#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="
echo "--- BUN VERSION ---"
bun --version
echo ""

exec bun services/web-app/node_modules/@react-router/serve/bin.js ./services/web-app/build/server/index.js
