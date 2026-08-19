#!/usr/bin/env bash
# Cloud Agent install: idempotent, self-contained repository bootstrap.
#
# Works from a clean Ubuntu base image (no personal snapshot required):
#   - installs bun (if missing) and a native PostgreSQL server (if missing)
#   - starts Postgres, writes dev .env files
#   - installs deps, generates the Prisma client, migrates, and seeds dev data
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="$HOME/.bun/bin:$PATH"

DB_NAME="yawp_workspace"
DATABASE_URL="postgresql://postgres:password@127.0.0.1:5432/${DB_NAME}"

ensure_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
  bun --version
}

apt_install_with_retry() {
  # Isolated build pods occasionally return transient 400s from the Ubuntu
  # mirror. Retry update+install a few times before giving up.
  local attempt
  for attempt in 1 2 3 4 5; do
    sudo apt-get update -qq -o Acquire::Retries=3 && \
      sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
        -o Acquire::Retries=3 --fix-missing "$@" && return 0
    echo "apt install attempt ${attempt} failed; retrying..." >&2
    sleep $((attempt * 4))
  done
  return 1
}

ensure_postgres_installed() {
  if ! command -v pg_lsclusters >/dev/null 2>&1 && ! ls /usr/lib/postgresql/ >/dev/null 2>&1; then
    apt_install_with_retry postgresql postgresql-contrib
  fi
}

pg_version() { ls /usr/lib/postgresql/ | sort -n | tail -1; }

ensure_postgres_running() {
  local ver
  ver="$(pg_version)"
  if ! sudo pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q online; then
    sudo pg_ctlcluster "$ver" main start 2>/dev/null || true
  fi
  for _ in $(seq 1 60); do
    if sudo -u postgres pg_isready -q; then return; fi
    sleep 1
  done
  echo "Postgres did not become ready in time." >&2
  exit 1
}

ensure_database() {
  sudo -u postgres psql -tAc "ALTER USER postgres WITH PASSWORD 'password';" >/dev/null
  if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE DATABASE \"${DB_NAME}\";" >/dev/null
  fi
}

write_env_files() {
  cat > "$ROOT/packages/prisma/.env" <<EOF
DATABASE_URL="${DATABASE_URL}"
EOF

  cat > "$ROOT/services/web-app/.env" <<EOF
NODE_ENV=development
DATABASE_URL="${DATABASE_URL}"
DATABASE_PATH=".local-dev.sqlite"
CACHE_DATABASE_PATH=".cache.sqlite"
SESSION_SECRET="cloud-agent-dev-secret"
HONEYPOT_SECRET="cloud-agent-honeypot"
INTERNAL_COMMAND_TOKEN="cloud-agent-internal-token"
AWS_S3_BUCKET_FOR_VIDEOS="cloud-agent-local-dev-bucket"
AWS_S3_REGION_FOR_VIDEOS="us-east-1"
CLASS_INSIGHT_MOCK_MODE=fixture
AI_MODEL="claude-sonnet-4-5"
ANTHROPIC_API_KEY=""
EOF
}

database_seeded() {
  local has_table has_admin
  has_table="$(PGPASSWORD=password psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='User';" 2>/dev/null || echo 0)"
  [[ "${has_table// /}" == "1" ]] || return 1
  has_admin="$(PGPASSWORD=password psql -h 127.0.0.1 -U postgres -d "$DB_NAME" -tAc \
    "SELECT COUNT(*) FROM \"User\" WHERE email='dev.admin@yawp.local';" 2>/dev/null || echo 0)"
  [[ "${has_admin// /}" -gt 0 ]]
}

ensure_bun
ensure_postgres_installed
ensure_postgres_running
ensure_database
write_env_files

bun install
bun prisma:generate
bun run --cwd packages/prisma prisma migrate deploy
bun run --cwd packages/prisma backfill-class-art-key

if ! database_seeded; then
  bun db:seed-local-dev
fi
bun run --cwd packages/prisma ensure-class-insights-local

echo "Cloud Agent install complete."
echo "  App (after start):  http://localhost:5176/"
echo "  Database:           ${DATABASE_URL}"
echo "  Dev logins (pw yawp-dev): dev.admin@yawp.local, dev.teacher@yawp.local, dev.student@yawp.local"
