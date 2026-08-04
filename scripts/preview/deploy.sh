#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
export SOURCE_DIR

source "$SCRIPT_DIR/tooling-artifacts.sh"

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
ACCESS_CODE_FILE="$PREVIEW_DIR/access-code"
ACCESS_SEATS_FILE="$PREVIEW_DIR/access-seats.json"
ACCESS_SECRET_FILE="$PREVIEW_DIR/access-secret"
SESSION_SECRET_FILE="$PREVIEW_DIR/session-secret"
export PREVIEW_SEAT_COUNT="${PREVIEW_SEAT_COUNT:-6}"

load_or_create_access_config() {
  umask 077
  if [[ -z "${PREVIEW_ACCESS_SEATS:-}" ]]; then
    local existing_seats="[]"
    local legacy_codes="${PREVIEW_ACCESS_CODES:-}"
    if [[ -s "$ACCESS_SEATS_FILE" ]]; then
      existing_seats="$(<"$ACCESS_SEATS_FILE")"
    elif [[ -z "$legacy_codes" && -s "$ACCESS_CODE_FILE" ]]; then
      legacy_codes="$(<"$ACCESS_CODE_FILE")"
    fi
    PREVIEW_ACCESS_SEATS="$(
      PREVIEW_EXISTING_ACCESS_SEATS="$existing_seats" \
      PREVIEW_ACCESS_CODES="$legacy_codes" \
      node "$SCRIPT_DIR/access-code.mjs" --seats
    )"
    printf '%s\n' "$PREVIEW_ACCESS_SEATS" > "$ACCESS_SEATS_FILE"
  fi

  PREVIEW_ACCESS_CODES="$(
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
      "process.stdout.write(JSON.parse(process.env.PREVIEW_ACCESS_SEATS).map((seat) => seat.code).join(','))"
  )"
  # A retained seat map may be larger than a subsequently lowered count. Never
  # orphan one of those worlds on a reset; seed through the full retained map.
  PREVIEW_SEAT_COUNT="$(
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
      "process.stdout.write(String(JSON.parse(process.env.PREVIEW_ACCESS_SEATS).length))"
  )"

  if [[ -z "${PREVIEW_ACCESS_SECRET:-}" ]]; then
    if [[ -s "$ACCESS_SECRET_FILE" ]]; then
      PREVIEW_ACCESS_SECRET="$(<"$ACCESS_SECRET_FILE")"
    else
      PREVIEW_ACCESS_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
      printf '%s\n' "$PREVIEW_ACCESS_SECRET" > "$ACCESS_SECRET_FILE"
    fi
  fi

  if [[ -z "${PREVIEW_SESSION_SECRET:-}" ]]; then
    if [[ -s "$SESSION_SECRET_FILE" ]]; then
      PREVIEW_SESSION_SECRET="$(<"$SESSION_SECRET_FILE")"
    else
      PREVIEW_SESSION_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64url'))")"
      printf '%s\n' "$PREVIEW_SESSION_SECRET" > "$SESSION_SECRET_FILE"
    fi
  fi

  export PREVIEW_ACCESS_CODES PREVIEW_ACCESS_SEATS PREVIEW_ACCESS_SECRET PREVIEW_SESSION_SECRET PREVIEW_SEAT_COUNT
}

load_or_create_access_config
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

create_seed_preview_database() {
  validate_database_name "$DATABASE_NAME"
  echo "Creating preview database $DATABASE_NAME for seeded local-dev data..."
  docker exec "$POSTGRES_CONTAINER" createdb -U postgres "$DATABASE_NAME"
  DATABASE_CREATED=1
}

ensure_preview_database() {
  case "$DATA_MODE" in
    seed)
      if [[ "${DEMO_RESET_DATA:-false}" == "true" ]]; then
        reset_seed_preview_database
      elif database_exists "$DATABASE_NAME"; then
        echo "Preview database $DATABASE_NAME already exists; preserving seat data."
      else
        create_seed_preview_database
      fi
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
        packages/prisma/scripts/preview-seats.ts \
        packages/prisma/scripts/seed-preview-seats.ts \
        packages/prisma/scripts/local-dev/class-insights.ts \
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
      tooling_command='bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy && bun run scripts/backfill-class-art-key.ts'
      if [[ "$DATABASE_CREATED" == "1" ]]; then
        tooling_command+=' && bun run seed-local-dev'
      fi
      tooling_command+=' && bun run scripts/assignment-type-release-gate.ts --require-data'
      ;;
    production-dump)
      tooling_command='bun install --ignore-scripts && bun prisma generate && cd packages/prisma && bun prisma migrate deploy && bun run scripts/backfill-class-art-key.ts && bun run scripts/assignment-type-release-gate.ts --require-data'
      ;;
  esac

  "${compose[@]}" run --rm toolbox bash -lc "$tooling_command"
  printf '%s\n' "$fingerprint" > "$TOOLING_FINGERPRINT_FILE"
}

ensure_preview_seats() {
  if [[ "$DATA_MODE" != "seed" ]]; then
    return 0
  fi
  "${compose[@]}" run --rm toolbox bash -lc \
    'cd packages/prisma && bun run seed-preview-seats'
}

remove_legacy_project_postgres() {
  docker rm -f "${COMPOSE_PROJECT}-postgres-1" >/dev/null 2>&1 || true
  docker volume rm "${COMPOSE_PROJECT}_${COMPOSE_PROJECT}-postgres-data" >/dev/null 2>&1 || true
}

refresh_web_container_if_needed() {
  "${compose[@]}" up -d --force-recreate web
  remove_legacy_project_postgres
}

ensure_shared_postgres
ensure_preview_database
run_tooling_if_needed
ensure_preview_seats
start_or_refresh_web() {
  refresh_web_container_if_needed
}
start_or_refresh_web

health_url="${PREVIEW_HEALTHCHECK_URL:-${URL}/api/healthcheck}"
login_url="${PREVIEW_LOGIN_URL:-${URL}}"
smoke_access_code="$(
  PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e \
    "process.stdout.write(JSON.parse(process.env.PREVIEW_ACCESS_SEATS)[0].code)"
)"
if [[ -n "${DIRECT_PORT:-}" ]]; then
  health_url="http://127.0.0.1:${DIRECT_PORT}/api/healthcheck"
  login_url="http://127.0.0.1:${DIRECT_PORT}"
fi

for attempt in $(seq 1 90); do
  if curl -fsS --connect-timeout 1 --max-time 2 "$health_url" >/dev/null; then
    PREVIEW_BASE_URL="$login_url" PREVIEW_DATA_MODE="$DATA_MODE" PREVIEW_ACCESS_CODE="$smoke_access_code" node "$SCRIPT_DIR/smoke-login.mjs"
    end_ms="$(date +%s%3N)"
    elapsed_ms="$((end_ms - start_ms))"
    echo "PREVIEW_URL=$URL"
    echo "PREVIEW_HOSTNAME=$HOSTNAME"
    echo "PREVIEW_ACCESS_CODE=$smoke_access_code"
    PREVIEW_ACCESS_SEATS="$PREVIEW_ACCESS_SEATS" node -e '
      for (const [index, seat] of JSON.parse(process.env.PREVIEW_ACCESS_SEATS).entries()) {
        console.log(`PREVIEW_SEAT_CODE_${index + 1}=${seat.code}`)
        console.log(`Preview seat ${index + 1} (${seat.label}): ${seat.code}`)
      }
    '
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
