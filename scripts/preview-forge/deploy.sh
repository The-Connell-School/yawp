#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export SOURCE_DIR

eval "$(node "$SCRIPT_DIR/preview-env.mjs" --shell)"

mkdir -p "$PREVIEW_DIR"
node "$SCRIPT_DIR/render-compose.mjs" > "$PREVIEW_DIR/docker-compose.yml"

docker network inspect preview-forge >/dev/null 2>&1 || docker network create preview-forge >/dev/null

start_ms="$(date +%s%3N)"
compose=(docker compose -p "$COMPOSE_PROJECT" -f "$PREVIEW_DIR/docker-compose.yml")

"${compose[@]}" up -d --build postgres

for _ in $(seq 1 60); do
  if "${compose[@]}" exec -T postgres pg_isready -U postgres -d yawp_preview >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

"${compose[@]}" stop web >/dev/null 2>&1 || true

if [[ "$RUNTIME" == "production" ]]; then
  COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build toolbox
  COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build web
else
  "${compose[@]}" pull --quiet toolbox web || true
fi

"${compose[@]}" run --rm toolbox bash -lc 'bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy && cd /app && bun run packages/prisma/scripts/seed-overlay.ts'
"${compose[@]}" up -d --force-recreate web

health_url="${PREVIEW_FORGE_HEALTHCHECK_URL:-${URL}/api/healthcheck}"
if [[ -n "${DIRECT_PORT:-}" ]]; then
  health_url="http://127.0.0.1:${DIRECT_PORT}/api/healthcheck"
fi

for attempt in $(seq 1 90); do
  if curl -fsS --connect-timeout 1 --max-time 2 "$health_url" >/dev/null; then
    end_ms="$(date +%s%3N)"
    elapsed_ms="$((end_ms - start_ms))"
    echo "PREVIEW_URL=$URL"
    echo "PREVIEW_HOSTNAME=$HOSTNAME"
    echo "PREVIEW_ELAPSED_MS=$elapsed_ms"
    exit 0
  fi
  echo "Waiting for preview healthcheck ($attempt/90): $health_url"
  sleep 1
done

echo "Preview did not become healthy: $health_url" >&2
"${compose[@]}" ps >&2 || true
"${compose[@]}" logs --tail=120 web >&2 || true
exit 1
