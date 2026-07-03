#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SLUG="$(basename "$ROOT")"
CONFIG_DIR="$ROOT/.worktree-local"
CONFIG_FILE="$CONFIG_DIR/config.env"

usage() {
  cat <<'EOF'
Usage: scripts/worktree-local-setup.sh [--fresh] [--no-dev]

Bootstraps an isolated local dev environment for this git worktree:
  - dedicated Postgres Docker container with persistent volume
  - worktree-specific .env files
  - prisma migrate + local dev seed

Options:
  --fresh   Drop and recreate the database, then re-seed
  --no-dev  Skip starting the dev server
EOF
}

hash_slot() {
  local input="$1"
  local max="$2"
  python3 -c "import hashlib,sys; h=int(hashlib.md5(sys.argv[1].encode()).hexdigest(),16); print(h % int(sys.argv[2]))" "$input" "$max"
}

ensure_config() {
  mkdir -p "$CONFIG_DIR"

  if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    return
  fi

  local slot
  slot="$(hash_slot "$SLUG" 70)"
  PG_PORT=$((54320 + slot))
  DEV_PORT=$((5176 + slot))
  CONTAINER_NAME="yawp-${SLUG}-postgres"
  VOLUME_NAME="yawp-${SLUG}-postgres-data"
  DB_NAME="yawp_${SLUG}"

  cat >"$CONFIG_FILE" <<EOF
SLUG=$SLUG
PG_PORT=$PG_PORT
DEV_PORT=$DEV_PORT
CONTAINER_NAME=$CONTAINER_NAME
VOLUME_NAME=$VOLUME_NAME
DB_NAME=$DB_NAME
PG_USER=postgres
PG_PASSWORD=password
DATABASE_URL=postgresql://postgres:password@127.0.0.1:${PG_PORT}/${DB_NAME}
EOF
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
}

docker_available() {
  command -v docker >/dev/null 2>&1 && docker ps >/dev/null 2>&1
}

ensure_postgres() {
  if ! docker_available; then
    echo "Docker is required for isolated worktree Postgres." >&2
    exit 1
  fi

  if docker inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME")" != "true" ]]; then
      docker start "$CONTAINER_NAME" >/dev/null
    fi
  else
    docker run -d \
      --name "$CONTAINER_NAME" \
      --restart unless-stopped \
      -e POSTGRES_USER="$PG_USER" \
      -e POSTGRES_PASSWORD="$PG_PASSWORD" \
      -e POSTGRES_DB="$DB_NAME" \
      -p "${PG_PORT}:5432" \
      -v "${VOLUME_NAME}:/var/lib/postgresql/data" \
      postgres:16 >/dev/null
  fi

  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER_NAME" pg_isready -U "$PG_USER" >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  echo "Postgres did not become ready in time." >&2
  exit 1
}

copy_optional_env_value() {
  local key="$1"
  local file="$2"
  if [[ -f "$file" ]]; then
    rg "^${key}=" "$file" --no-line-number 2>/dev/null | head -1 || true
  fi
}

write_env_files() {
  local anthropic_line=""
  local ai_model_line=""
  local main_env=""

  if git_common="$(git -C "$ROOT" rev-parse --git-common-dir 2>/dev/null)"; then
    main_env="$(cd "$(dirname "$git_common")" && pwd)/services/web-app/.env"
  fi

  anthropic_line="$(copy_optional_env_value ANTHROPIC_API_KEY "${main_env:-}")"
  ai_model_line="$(copy_optional_env_value AI_MODEL "${main_env:-}")"

  cat >"$ROOT/packages/prisma/.env" <<EOF
DATABASE_URL="${DATABASE_URL}"
EOF

  cat >"$ROOT/services/web-app/.env" <<EOF
NODE_ENV=development
DATABASE_URL="${DATABASE_URL}"
DATABASE_PATH=".local-dev.sqlite"
CACHE_DATABASE_PATH=".cache.sqlite"
SESSION_SECRET="${SLUG}-worktree-dev-secret"
HONEYPOT_SECRET="${SLUG}-worktree-honeypot"
INTERNAL_COMMAND_TOKEN="${SLUG}-worktree-internal-token"
AWS_S3_BUCKET_FOR_VIDEOS="${SLUG}-local-dev-bucket"
AWS_S3_REGION_FOR_VIDEOS="us-east-1"
${ai_model_line:-AI_MODEL="claude-sonnet-4-5"}
${anthropic_line:-ANTHROPIC_API_KEY=""}
EOF

  if [[ ! -f "$ROOT/.env" ]]; then
    cat >"$ROOT/.env" <<EOF
AWS_PROFILE=default
EOF
  fi
}

reset_database() {
  docker exec "$CONTAINER_NAME" psql -U "$PG_USER" -d postgres -v ON_ERROR_STOP=1 \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
    -c "DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
    -c "CREATE DATABASE \"${DB_NAME}\";"
}

database_seeded() {
  local count
  count="$(docker exec "$CONTAINER_NAME" psql -U "$PG_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'User';" 2>/dev/null || echo 0)"
  [[ "${count// /}" == "1" ]] || return 1
  count="$(docker exec "$CONTAINER_NAME" psql -U "$PG_USER" -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM \"User\" WHERE email = 'dev.admin@yawp.local';" 2>/dev/null || echo 0)"
  [[ "${count// /}" -gt 0 ]]
}

migrate_and_seed() {
  (
    cd "$ROOT"
    bun install
    bun prisma:generate
    bun run --cwd packages/prisma prisma migrate deploy
    bun run --cwd packages/prisma backfill-class-art-key
    bun db:seed-local-dev
  )
}

smoke_dev_login() {
  local dev_port="${DEV_PORT:-5176}"
  if ! curl -fsS "http://localhost:${dev_port}/" >/dev/null 2>&1; then
    echo "Dev server not running on :${dev_port}; skipping login smoke test."
    return 0
  fi

  local status
  status="$(
    curl -sS -o /dev/null -w '%{http_code}' \
      -X POST "http://localhost:${dev_port}/auth/dev-login" \
      -H 'content-type: application/x-www-form-urlencoded' \
      --data 'email=dev.admin@yawp.local&redirectTo=/app'
  )"

  if [[ "$status" != "302" && "$status" != "303" ]]; then
    echo "Dev login smoke test failed (HTTP ${status}). Check DATABASE_URL and seed data." >&2
    exit 1
  fi
}

print_summary() {
  cat <<EOF

Worktree local dev ready (${SLUG})
  App:        http://localhost:${DEV_PORT:-5176}/
  Postgres:   ${DATABASE_URL}
  Container:  ${CONTAINER_NAME}
  Config:     ${CONFIG_FILE}

Dev logins (password: yawp-dev):
  dev.admin@yawp.local
  dev.teacher@yawp.local
  dev.student@yawp.local

Commands:
  bash scripts/worktree-local-setup.sh          # ensure db + env
  bash scripts/worktree-local-setup.sh --fresh  # reset + re-seed
  bun dev                                       # start app
EOF
}

FRESH=0
START_DEV=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh) FRESH=1 ;;
    --no-dev) START_DEV=0 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
  esac
  shift
done

ensure_config
ensure_postgres
write_env_files

if [[ "$FRESH" -eq 1 ]]; then
  reset_database
  migrate_and_seed
elif ! database_seeded; then
  migrate_and_seed
else
  (
    cd "$ROOT"
    bun prisma:generate >/dev/null
  )
fi

if [[ "$START_DEV" -eq 1 ]]; then
  if ! curl -fsS "http://localhost:${DEV_PORT}/" >/dev/null 2>&1; then
    echo "Start the app with: bun dev"
  fi
fi

smoke_dev_login
print_summary
