#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
eval "$(node "$SCRIPT_DIR/preview-env.mjs" --shell)"

compose_file="$PREVIEW_DIR/docker-compose.yml"
if [[ -f "$compose_file" ]]; then
  docker compose -p "$COMPOSE_PROJECT" -f "$compose_file" down -v --remove-orphans
else
  docker compose -p "$COMPOSE_PROJECT" down -v --remove-orphans || true
fi

rm -rf "$PREVIEW_DIR"
echo "Destroyed $SLUG"
