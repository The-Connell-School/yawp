#!/bin/bash
set -euo pipefail

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="
echo "--- BUN VERSION ---"
bun --version
echo ""

cd "$(dirname "$0")"

serve_bin="./node_modules/@react-router/serve/bin.js"
if [[ ! -f "$serve_bin" ]]; then
  serve_bin="../../node_modules/@react-router/serve/bin.js"
fi
if [[ ! -f "$serve_bin" ]]; then
  echo "Missing @react-router/serve runtime binary." >&2
  exit 1
fi

exec bun "$serve_bin" ./build/server/index.js
