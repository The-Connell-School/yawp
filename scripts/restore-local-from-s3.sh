#!/usr/bin/env bash
# Restore the production SQL dump from S3 into a local Postgres database, then apply
# migrations newer than the snapshot. Requires AWS CLI credentials (e.g. AWS_PROFILE=yawp).
#
# Usage:
#   export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/yawp_dev'
#   # Target DB must be empty (drop/create first if replacing an existing DB):
#   dropdb -h 127.0.0.1 -U postgres yawp_dev 2>/dev/null || true
#   createdb -h 127.0.0.1 -U postgres yawp_dev
#   ./scripts/restore-local-from-s3.sh
#
# Optional: after restore, upsert known E2E users on top of prod data:
#   DATABASE_URL="$DATABASE_URL" bun packages/prisma/scripts/seed-overlay.ts
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/lib/pg-dump-plain-to-psql.sh"
DUMP_URI="${DUMP_S3_URI:-s3://yawp-production-database-exports/Mar03260636.dump}"
DATA_DIR="${ROOT}/services/web-app/e2e/.data"
DUMP_FILE="${DATA_DIR}/Mar03260636.dump"

: "${DATABASE_URL:?Set DATABASE_URL to the empty Postgres database to restore into}"

mkdir -p "${DATA_DIR}"

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "Downloading ${DUMP_URI} -> ${DUMP_FILE}"
  aws s3 cp "${DUMP_URI}" "${DUMP_FILE}" --profile "${AWS_PROFILE:-yawp}"
else
  echo "Using cached dump: ${DUMP_FILE}"
fi

echo "Restoring into ${DATABASE_URL} (this may take several minutes)..."
cat "${DUMP_FILE}" | pg_dump_plain_pipe_to_psql "${DATABASE_URL}"

echo "Applying Prisma migrations newer than the dump..."
(
  cd "${ROOT}/packages/prisma"
  DATABASE_URL="${DATABASE_URL}" bunx prisma migrate deploy
)

echo "Generating Prisma client..."
(
  cd "${ROOT}/packages/prisma"
  bunx prisma generate
)

echo "Done. Point your app DATABASE_URL at this database and restart the dev server."
