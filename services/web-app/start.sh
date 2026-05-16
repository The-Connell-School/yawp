#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="
echo "--- BUN VERSION ---"
bun --version
echo ""

cd "$(dirname "$0")"

exec bun node_modules/@react-router/serve/bin.js ./build/server/index.js
