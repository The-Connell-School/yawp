#!/usr/bin/env bash
# One command: pg_dump production (via SSH bastion) → save timestamped SQL → load locally → prisma migrate deploy.
#
# Prerequisites:
#   - SSH key can reach the bastion; bastion can reach RDS (same SG / network as today).
#   - `pg_dump` installed on the bastion (e.g. postgresql15 client).
#   - Local: `psql`, `bun`, local Postgres superuser can DROP/CREATE the target database.
#
# Setup once:
#   cp scripts/production-sync.env.example scripts/production-sync.env
#   # fill in bastion host, RDS host, user, db name, RDS password, local DATABASE_URL
#
# Run:
#   set -a && source scripts/production-sync.env && set +a && bun run db:sync-local-from-production
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/lib/pg-dump-plain-to-psql.sh"

: "${DATABASE_URL:?Set DATABASE_URL (local target; database name will be dropped and recreated)}"
: "${YAWP_PROD_BASTION_HOST:?Set YAWP_PROD_BASTION_HOST}"
: "${YAWP_PROD_BASTION_KEY:?Set YAWP_PROD_BASTION_KEY to your bastion .pem path}"
: "${YAWP_PROD_PG_HOST:?Set YAWP_PROD_PG_HOST (RDS hostname)}"
: "${YAWP_PROD_PG_USER:?Set YAWP_PROD_PG_USER}"
: "${YAWP_PROD_PG_DB:?Set YAWP_PROD_PG_DB}"

if [[ ! -f "${YAWP_PROD_BASTION_KEY}" ]]; then
  echo "Bastion key not found: ${YAWP_PROD_BASTION_KEY}" >&2
  exit 1
fi

YAWP_PROD_BASTION_USER="${YAWP_PROD_BASTION_USER:-ec2-user}"
YAWP_PROD_PG_PORT="${YAWP_PROD_PG_PORT:-5432}"
PROD_PW="${YAWP_PROD_PG_PASSWORD:-${PGPASSWORD:-}}"
if [[ -z "${PROD_PW}" ]]; then
  echo "Set YAWP_PROD_PG_PASSWORD to the production RDS password (or set PGPASSWORD for the same)." >&2
  exit 1
fi

DATA_DIR="${ROOT}/services/web-app/e2e/.data"
mkdir -p "${DATA_DIR}"
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${DATA_DIR}/production-live-${STAMP}.sql"

ADMIN_URL="$(
  bun -e "
    const u = new URL(process.env.DATABASE_URL);
    u.pathname = '/postgres';
    u.search = '';
    u.hash = '';
    console.log(u.toString());
  "
)"
TARGET_DB="$(
  bun -e "
    const u = new URL(process.env.DATABASE_URL);
    const seg = u.pathname.replace(/^\\//, '').split('/')[0] || '';
    console.log(seg.split('?')[0]);
  "
)"

if [[ -z "${TARGET_DB}" || "${TARGET_DB}" == "postgres" ]]; then
  echo "Refusing to use DATABASE_URL without a dedicated database name (got: '${TARGET_DB}')." >&2
  exit 1
fi

printf -v esc_pw '%q' "${PROD_PW}"

echo "Recreating local database \"${TARGET_DB}\"..."
psql "${ADMIN_URL}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\" WITH (FORCE);"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"

echo "Streaming pg_dump from bastion (also saving ${DUMP_FILE})..."
ssh -i "${YAWP_PROD_BASTION_KEY}" -o StrictHostKeyChecking=accept-new \
  "${YAWP_PROD_BASTION_USER}@${YAWP_PROD_BASTION_HOST}" \
  "export PGPASSWORD=${esc_pw}; pg_dump -h '${YAWP_PROD_PG_HOST}' -p '${YAWP_PROD_PG_PORT}' -U '${YAWP_PROD_PG_USER}' -d '${YAWP_PROD_PG_DB}' --format=plain --no-owner --no-acl" \
  | tee "${DUMP_FILE}" | pg_dump_plain_pipe_to_psql "${DATABASE_URL}"

echo "Applying Prisma migrations newer than the dump..."
if [[ -z "${YAWP_SKIP_MIGRATE:-}" ]]; then
  (
    cd "${ROOT}/packages/prisma"
    DATABASE_URL="${DATABASE_URL}" bunx prisma migrate deploy
  )

  echo "Generating Prisma client..."
  (
    cd "${ROOT}/packages/prisma"
    bunx prisma generate
  )
else
  echo "Skipping migrate deploy (YAWP_SKIP_MIGRATE is set)."
fi

echo "Done. Snapshot: ${DUMP_FILE}"
