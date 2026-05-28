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

stream_preview_dump() {
  if [[ -n "${PREVIEW_DB_DUMP_URL:-}" ]]; then
    curl -fSsL --retry 3 --retry-delay 2 "$PREVIEW_DB_DUMP_URL"
  else
    if ! aws sts get-caller-identity >/dev/null 2>&1; then
      echo "Preview host cannot access AWS. Attach an instance profile that can read ${DUMP_URI} or provide PREVIEW_DB_DUMP_URL." >&2
      exit 1
    fi
    aws s3 cp "$DUMP_URI" -
  fi
}

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

existing_tables="$("${compose[@]}" exec -T postgres psql -U postgres -d yawp_preview -Atc "SELECT COUNT(*)::text FROM pg_tables WHERE schemaname = 'public'")"
existing_tables="${existing_tables//[[:space:]]/}"
if [[ "${existing_tables:-0}" -gt 0 ]]; then
  echo "Schema already has ${existing_tables} table(s); skipping production dump restore to preserve preview data."
else
  DUMP_URI="${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"
  echo "Restoring production dump into preview database from ${DUMP_URI}..."
  stream_preview_dump \
    | sed -e '/^\\restrict/d' \
          -e '/^\\unrestrict/d' \
          -e '/^SET transaction_timeout/d' \
          -e '/OWNER TO /d' \
          -e '/^GRANT /d' \
          -e '/^REVOKE /d' \
    | "${compose[@]}" exec -T postgres psql -U postgres -d yawp_preview -v ON_ERROR_STOP=1
fi

"${compose[@]}" run --rm toolbox bash -lc 'bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy'
"${compose[@]}" up -d --force-recreate web

health_url="${PREVIEW_FORGE_HEALTHCHECK_URL:-${URL}/api/healthcheck}"
login_url="${PREVIEW_FORGE_LOGIN_URL:-${URL}}"
if [[ -n "${DIRECT_PORT:-}" ]]; then
  health_url="http://127.0.0.1:${DIRECT_PORT}/api/healthcheck"
  login_url="http://127.0.0.1:${DIRECT_PORT}"
fi

for attempt in $(seq 1 90); do
  if curl -fsS --connect-timeout 1 --max-time 2 "$health_url" >/dev/null; then
    PREVIEW_BASE_URL="$login_url" node "$SCRIPT_DIR/smoke-login.mjs"
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
