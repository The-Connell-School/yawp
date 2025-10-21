#!/bin/bash

echo "=========================================="
echo "DIAGNOSTIC INFORMATION"
echo "=========================================="
echo ""

echo "--- CURRENT DIRECTORY ---"
pwd
echo ""

echo "--- DIRECTORY LISTING (pwd) ---"
ls -la
echo ""

echo "--- SERVICES/WEB-APP DIRECTORY ---"
ls -la services/web-app/ 2>/dev/null || echo "services/web-app/ not found"
echo ""

echo "--- BUN VERSION ---"
bun --version
echo ""

echo "--- NODE VERSION ---"
node --version 2>/dev/null || echo "node not found"
echo ""

echo "--- PATH VARIABLE ---"
echo $PATH
echo ""

echo "--- WHICH BUN ---"
which bun
echo ""

echo "--- NODE_MODULES/.BIN DIRECTORY ---"
ls -la node_modules/.bin/ 2>/dev/null || echo "node_modules/.bin/ not found"
echo ""

echo "--- SEARCHING FOR react-router-serve ---"
find . -name "react-router-serve" -type f 2>/dev/null || echo "react-router-serve not found"
echo ""

echo "--- CHECKING IF react-router-serve IS EXECUTABLE ---"
which react-router-serve || echo "react-router-serve not in PATH"
echo ""

echo "--- NODE_MODULES STRUCTURE (first level) ---"
ls -la node_modules/ 2>/dev/null | head -20 || echo "node_modules/ not found"
echo ""

echo "--- @react-router/serve DIRECTORY ---"
ls -la node_modules/@react-router/serve/ 2>/dev/null || echo "@react-router/serve not found"
echo ""

echo "--- @react-router/serve/package.json ---"
cat node_modules/@react-router/serve/package.json 2>/dev/null || echo "@react-router/serve/package.json not found"
echo ""

echo "--- ENVIRONMENT VARIABLES ---"
env | sort
echo ""

echo "--- PACKAGE.JSON LOCATION ---"
ls -la package.json
echo ""

echo "--- WORKSPACE PACKAGE.JSON ---"
cat package.json | grep -A 10 "workspaces" || echo "No workspaces found"
echo ""

echo "=========================================="
echo "STARTING APPLICATION"
echo "=========================================="
echo ""

exec bun run web-app:start

