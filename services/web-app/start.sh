#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="
echo "--- BUN VERSION ---"
bun --version
echo ""

cd "$(dirname "$0")"

exec bun ./server/express.ts ./build/server/index.js
