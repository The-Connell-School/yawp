#!/usr/bin/env bash
# Idempotently ensure intern QA teachers on the live demo database (yawp_demo only).
set -euo pipefail

PREVIEW_ROOT="${PREVIEW_ROOT:-/srv/yawp-demo}"
PREVIEW_SLUG="${PREVIEW_SLUG:-demo}"
COMPOSE_PROJECT="${PREVIEW_COMPOSE_PROJECT:-yawp-${PREVIEW_SLUG}}"
PREVIEW_DIR="${PREVIEW_DIR:-${PREVIEW_ROOT}/previews/${PREVIEW_SLUG}}"
COMPOSE_FILE="${PREVIEW_COMPOSE_FILE:-${PREVIEW_DIR}/docker-compose.yml}"
APP_SOURCE_DIR="${APP_SOURCE_DIR:-${PREVIEW_ROOT}/sources/demo}"

[[ "$PREVIEW_ROOT" =~ ^/[A-Za-z0-9._/-]+$ ]] || {
  echo "Invalid PREVIEW_ROOT" >&2
  exit 1
}
[[ "$COMPOSE_PROJECT" =~ ^[a-z0-9][a-z0-9_-]*$ ]] || {
  echo "Invalid PREVIEW_COMPOSE_PROJECT" >&2
  exit 1
}
[[ -d "$APP_SOURCE_DIR" ]] || {
  echo "Application source directory is missing: $APP_SOURCE_DIR" >&2
  exit 1
}
[[ -f "$COMPOSE_FILE" ]] || {
  echo "Demo compose file is missing: $COMPOSE_FILE" >&2
  exit 1
}
[[ -f "$APP_SOURCE_DIR/packages/prisma/scripts/local-dev/run-ensure-intern-qa-teachers.ts" ]] || {
  echo "Ensure script is missing from APP_SOURCE_DIR; sync a newer ref before running." >&2
  exit 1
}

compose=(docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE")

prisma_cli='bash scripts/preview/prisma-cli.sh'
if [[ -x "$PREVIEW_ROOT/control/demo/scripts/preview/prisma-cli.sh" ]]; then
  prisma_cli='bash /preview-control/prisma-cli.sh'
fi

tooling_command="bun install --ignore-scripts && ${prisma_cli} generate && cd packages/prisma && ENSURE_INTERN_QA_REQUIRE_DEMO=1 PREVIEW_SLUG=demo DATABASE_NAME=yawp_demo bun run ensure-intern-qa-teachers"

"${compose[@]}" run --rm \
  -v "${APP_SOURCE_DIR}:/app" \
  toolbox bash -lc "$tooling_command"
