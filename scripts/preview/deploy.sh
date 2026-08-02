#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export SOURCE_DIR

source "$SCRIPT_DIR/tooling-artifacts.sh"

: "${PREVIEW_BASIC_AUTH:?Missing PREVIEW_BASIC_AUTH (expected one htpasswd-format credential)}"
: "${PREVIEW_BASIC_AUTH_PASSWORD:?Missing PREVIEW_BASIC_AUTH_PASSWORD for authenticated preview smoke checks}"

export PREVIEW_DATA_MODE="${PREVIEW_DATA_MODE:-seed}"
export PREVIEW_DEV_LOGIN_EMAIL="${PREVIEW_DEV_LOGIN_EMAIL:-dev.teacher@yawp.local}"
eval "$(node "$SCRIPT_DIR/preview-env.mjs" --shell)"

# preview-env.mjs already derives this and exports it in the eval above — yawp_pr_142 for
# a PR preview, yawp_demo for a slug-named environment like the demo box. Recomputing it
# from PR_NUMBER here defeated the slug override: a named environment has no PR number, so
# this produced the database "yawp_pr_" and, because PR_NUMBER is exported as an empty
# string rather than left unset, did it silently instead of failing under `set -u`.
: "${DATABASE_NAME:?preview-env.mjs did not export DATABASE_NAME}"
DUMP_URI="${PREVIEW_DB_DUMP_S3_URI:-s3://yawp-preview-videos/production.dump}"
POSTGRES_CONTAINER="${PREVIEW_POSTGRES_CONTAINER:-preview-postgres}"
POSTGRES_PROJECT="${PREVIEW_POSTGRES_PROJECT:-yawp-preview-db}"
TEMPLATE_DB="${PREVIEW_DB_TEMPLATE_DB:-${TEMPLATE_DATABASE_NAME:-yawp_template}}"
DB_COMPOSE_DIR="$ROOT/postgres"
DB_COMPOSE_FILE="$DB_COMPOSE_DIR/docker-compose.yml"
TOOLING_FINGERPRINT_FILE="$PREVIEW_DIR/tooling.sha256"
TOOLING_CHANGED=1
DATABASE_CREATED=0

mkdir -p "$PREVIEW_DIR" "$DB_COMPOSE_DIR"
node "$SCRIPT_DIR/render-compose.mjs" > "$PREVIEW_DIR/docker-compose.yml"

docker network inspect preview >/dev/null 2>&1 || docker network create preview >/dev/null

start_ms="$(date +%s%3N)"
compose=(docker compose -p "$COMPOSE_PROJECT" -f "$PREVIEW_DIR/docker-compose.yml")
db_compose=(docker compose -p "$POSTGRES_PROJECT" -f "$DB_COMPOSE_FILE")

validate_database_name() {
  local database_name="$1"
  if [[ ! "$database_name" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
    echo "Invalid Postgres database name: $database_name" >&2
    exit 1
  fi
}

write_shared_postgres_compose() {
  cat > "$DB_COMPOSE_FILE" <<YAML
services:
  postgres:
    image: postgres:16
    container_name: ${POSTGRES_CONTAINER}
    restart: unless-stopped
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DATABASE_PASSWORD:-postgres}
      POSTGRES_DB: postgres
    volumes:
      - preview-postgres-data:/var/lib/postgresql/data
    networks:
      - preview

volumes:
  preview-postgres-data:

networks:
  preview:
    external: true
YAML
}

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

wait_for_shared_postgres() {
  for _ in $(seq 1 60); do
    if docker exec "$POSTGRES_CONTAINER" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Shared preview Postgres did not become ready." >&2
  "${db_compose[@]}" ps >&2 || true
  "${db_compose[@]}" logs --tail=120 postgres >&2 || true
  exit 1
}

connect_shared_postgres_to_preview_network() {
  docker network connect preview "$POSTGRES_CONTAINER" >/dev/null 2>&1 || true
}

ensure_shared_postgres() {
  write_shared_postgres_compose
  "${db_compose[@]}" up -d
  connect_shared_postgres_to_preview_network
  wait_for_shared_postgres
}

database_exists() {
  local database_name="$1"
  validate_database_name "$database_name"
  local exists
  exists="$(docker exec "$POSTGRES_CONTAINER" psql -U postgres -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '${database_name}'" | tr -d '[:space:]')"
  [[ "$exists" == "1" ]]
}

restore_dump_into_template() {
  echo "Restoring production dump into template database from ${DUMP_URI}..."
  stream_preview_dump \
    | sed -e '/^\\restrict/d' \
          -e '/^\\unrestrict/d' \
          -e '/^SET transaction_timeout/d' \
          -e '/OWNER TO /d' \
          -e '/^GRANT /d' \
          -e '/^REVOKE /d' \
    | docker exec -i "$POSTGRES_CONTAINER" psql -U postgres -d "$TEMPLATE_DB" -v ON_ERROR_STOP=1
}

ensure_template_database() {
  validate_database_name "$TEMPLATE_DB"
  local lock_file="$ROOT/preview-postgres.lock"

  (
    flock 9
    if database_exists "$TEMPLATE_DB"; then
      echo "Template database $TEMPLATE_DB already exists; skipping production dump restore."
      exit 0
    fi

    docker exec "$POSTGRES_CONTAINER" createdb -U postgres "$TEMPLATE_DB"
    if ! restore_dump_into_template; then
      docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --if-exists "$TEMPLATE_DB" || true
      exit 1
    fi
  ) 9>"$lock_file"
}

ensure_production_dump_preview_database() {
  validate_database_name "$DATABASE_NAME"
  if database_exists "$DATABASE_NAME"; then
    echo "Preview database $DATABASE_NAME already exists; skipping clone."
    return 0
  fi

  docker exec "$POSTGRES_CONTAINER" createdb -U postgres -T "$TEMPLATE_DB" "$DATABASE_NAME"
  DATABASE_CREATED=1
}

reset_seed_preview_database() {
  validate_database_name "$DATABASE_NAME"
  echo "Resetting preview database $DATABASE_NAME for seeded local-dev data..."
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
  docker exec "$POSTGRES_CONTAINER" dropdb -U postgres --force --if-exists "$DATABASE_NAME"
  docker exec "$POSTGRES_CONTAINER" createdb -U postgres "$DATABASE_NAME"
  DATABASE_CREATED=1
}

ensure_preview_database() {
  case "$DATA_MODE" in
    seed)
      reset_seed_preview_database
      ;;
    production-dump)
      ensure_template_database
      ensure_production_dump_preview_database
      ;;
    *)
      echo "Unsupported PREVIEW_DATA_MODE: $DATA_MODE" >&2
      exit 1
      ;;
  esac
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$@"
  else
    shasum -a 256 "$@"
  fi
}

sha256_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum
  else
    shasum -a 256
  fi
}

compute_tooling_fingerprint() {
  (
    cd "$SOURCE_DIR"
    {
      for file in \
        package.json \
        bun.lock \
        bun.lockb \
        services/web-app/package.json \
        packages/prisma/package.json \
        packages/prisma/schema.prisma \
        packages/prisma/prisma.config.ts \
        packages/prisma/scripts/assignment-type-release-gate.ts \
        packages/prisma/scripts/backfill-class-art-key.ts \
        packages/prisma/scripts/seed-local-dev.ts \
        packages/prisma/scripts/local-dev/dev-personas.ts \
        packages/prisma/scripts/local-dev/seed-synthetic-data.ts \
        scripts/preview/deploy.sh
      do
        if [[ -f "$file" ]]; then
          sha256_file "$file"
        fi
      done

      if [[ -d packages/prisma/migrations ]]; then
        find packages/prisma/migrations -type f -print \
          | LC_ALL=C sort \
          | while IFS= read -r file; do
              sha256_file "$file"
            done
      fi
    } | sha256_stream | awk '{print $1}'
  )
}

run_tooling_if_needed() {
  local fingerprint
  local previous_fingerprint=""
  fingerprint="$(compute_tooling_fingerprint)"
  if [[ -f "$TOOLING_FINGERPRINT_FILE" ]]; then
    previous_fingerprint="$(<"$TOOLING_FINGERPRINT_FILE")"
  fi

  local missing_artifacts
  missing_artifacts="$(preview_missing_tooling_artifacts "$SOURCE_DIR" | awk 'BEGIN { first = 1 } { if (!first) printf ", "; printf "%s", $0; first = 0 }')"

  if [[ "$DATABASE_CREATED" == "0" && "$fingerprint" == "$previous_fingerprint" && -z "$missing_artifacts" ]]; then
    echo "Tooling fingerprint unchanged and database already existed; skipping install/generate/migrate."
    TOOLING_CHANGED=0
    return 0
  fi

  if [[ -n "$missing_artifacts" ]]; then
    echo "Preview tooling artifacts missing ($missing_artifacts); running install/generate/migrate."
  fi

  if [[ "$RUNTIME" == "production" ]]; then
    COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build toolbox
    COMPOSE_PARALLEL_LIMIT=1 "${compose[@]}" build web
  else
    "${compose[@]}" pull --quiet toolbox web || true
  fi

  local tooling_command
  case "$DATA_MODE" in
    seed)
      tooling_command='bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy && bun run scripts/backfill-class-art-key.ts && bun run seed-local-dev && bun run scripts/assignment-type-release-gate.ts --require-data'
      ;;
    production-dump)
      tooling_command='bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy && bun run scripts/backfill-class-art-key.ts && bun run scripts/assignment-type-release-gate.ts --require-data'
      ;;
  esac

  "${compose[@]}" run --rm toolbox bash -lc "$tooling_command"
  printf '%s\n' "$fingerprint" > "$TOOLING_FINGERPRINT_FILE"
}

remove_legacy_project_postgres() {
  docker rm -f "${COMPOSE_PROJECT}-postgres-1" >/dev/null 2>&1 || true
  docker volume rm "${COMPOSE_PROJECT}_${COMPOSE_PROJECT}-postgres-data" >/dev/null 2>&1 || true
}

refresh_web_container_if_needed() {
  "${compose[@]}" up -d --force-recreate web
  # Also start every other service the compose defines — the marketing
  # renderer foremost. Without this, new services exist in the compose file
  # but never run: `up web` starts exactly one container. No --force-recreate
  # here, so they restart only when their own configuration changed, which
  # preserves the renderer's bootstrapped toolchain across web-only deploys.
  "${compose[@]}" up -d
  remove_legacy_project_postgres
}

ensure_shared_postgres
ensure_preview_database
run_tooling_if_needed
start_or_refresh_web() {
  refresh_web_container_if_needed
}
start_or_refresh_web

health_url="${PREVIEW_HEALTHCHECK_URL:-${URL}/api/healthcheck}"
login_url="${PREVIEW_LOGIN_URL:-${URL}}"
basic_auth_username="${PREVIEW_BASIC_AUTH%%:*}"
if [[ -n "${DIRECT_PORT:-}" ]]; then
  health_url="http://127.0.0.1:${DIRECT_PORT}/api/healthcheck"
  login_url="http://127.0.0.1:${DIRECT_PORT}"
fi

for attempt in $(seq 1 90); do
  gate_status=""
  gate_ready=1
  if [[ -z "${DIRECT_PORT:-}" ]]; then
    gate_response="$(curl -sS -D - -o /dev/null -w $'\n%{http_code}' --connect-timeout 1 --max-time 2 "$health_url" || true)"
    gate_status="${gate_response##*$'\n'}"
    gate_headers="${gate_response%$'\n'*}"
    if [[ "$gate_status" != "401" ]] || ! grep -qi '^www-authenticate:[[:space:]]*Basic' <<<"$gate_headers"; then
      gate_ready=0
    fi
  fi

  if [[ "$gate_ready" == "1" ]] && curl -fsS --user "${basic_auth_username}:${PREVIEW_BASIC_AUTH_PASSWORD}" --connect-timeout 1 --max-time 2 "$health_url" >/dev/null; then
    PREVIEW_BASE_URL="$login_url" PREVIEW_DATA_MODE="$DATA_MODE" PREVIEW_BASIC_AUTH="$PREVIEW_BASIC_AUTH" PREVIEW_BASIC_AUTH_PASSWORD="$PREVIEW_BASIC_AUTH_PASSWORD" node "$SCRIPT_DIR/smoke-login.mjs"
    end_ms="$(date +%s%3N)"
    elapsed_ms="$((end_ms - start_ms))"
    echo "PREVIEW_URL=$URL"
    echo "PREVIEW_HOSTNAME=$HOSTNAME"
    echo "PREVIEW_ELAPSED_MS=$elapsed_ms"
    # Surface the marketing renderer's state in the CI log. It boots in the
    # background and has no healthcheck of its own; without this, a
    # crash-looping renderer is invisible from the outside.
    "${compose[@]}" ps || true
    "${compose[@]}" logs --tail=80 renderer 2>/dev/null || echo "No renderer service in this compose."
    exit 0
  fi
  echo "Waiting for preview healthcheck ($attempt/90, anonymous=${gate_status:-direct}): $health_url"
  sleep 1
done

echo "Preview did not become healthy: $health_url" >&2
"${compose[@]}" ps >&2 || true
"${compose[@]}" logs --tail=120 web >&2 || true
exit 1
