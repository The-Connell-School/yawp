#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
eval "$(node "$SCRIPT_DIR/preview-env.mjs" --shell)"
export PREVIEW_ROOT
# shellcheck source=remove-preview-path.sh
source "$SCRIPT_DIR/remove-preview-path.sh"

compose_file="$PREVIEW_DIR/docker-compose.yml"
if [[ -f "$compose_file" ]]; then
  docker compose -p "$COMPOSE_PROJECT" -f "$compose_file" down -v --remove-orphans
else
  docker compose -p "$COMPOSE_PROJECT" down -v --remove-orphans || true
fi

if docker inspect preview-postgres >/dev/null 2>&1; then
  docker exec preview-postgres dropdb -U postgres --if-exists "$DATABASE_NAME" || true
fi

docker volume rm "${COMPOSE_PROJECT}_${COMPOSE_PROJECT}-postgres-data" >/dev/null 2>&1 || true
preview_remove_path "$PREVIEW_DIR"
if [[ -n "${SOURCE_DIR:-}" ]]; then
  preview_remove_path "$SOURCE_DIR"
fi
echo "Destroyed $SLUG"
