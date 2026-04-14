#!/usr/bin/env bash
# Practice a full rollback locally: restore Postgres from a pre-release plain SQL dump, then checkout
# the repo at PRE_RELEASE_GIT_REF and regenerate Prisma client. Does NOT touch production.
#
# Before release, save artifacts:
#   git rev-parse HEAD   # put in PRE_RELEASE_GIT_REF after you tag or note the SHA
#   pg_dump ... > pre-release.sql && aws s3 cp pre-release.sql s3://your-bucket/...
#
# Usage:
#   export PRE_RELEASE_GIT_REF=abc123def
#   export PRE_RELEASE_DUMP_S3_URI=s3://bucket/path/pre-release.sql   # OR PRE_RELEASE_DUMP_LOCAL=/path/to.sql
#   export DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/yawp
#   YAWP_CONFIRM=yes ./scripts/practice-full-rollback.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/lib/pg-dump-plain-to-psql.sh"

: "${PRE_RELEASE_GIT_REF:?Set PRE_RELEASE_GIT_REF (commit SHA or tag from before release)}"
: "${DATABASE_URL:?Set DATABASE_URL (local target; database will be dropped and recreated)}"

if [[ "${YAWP_CONFIRM:-}" != "yes" ]]; then
  echo "Refusing to drop local DB without YAWP_CONFIRM=yes" >&2
  exit 1
fi

DUMP_FILE=""
if [[ -n "${PRE_RELEASE_DUMP_LOCAL:-}" ]]; then
  DUMP_FILE="${PRE_RELEASE_DUMP_LOCAL}"
elif [[ -n "${PRE_RELEASE_DUMP_S3_URI:-}" ]]; then
  DATA_DIR="${ROOT}/services/web-app/e2e/.data"
  mkdir -p "${DATA_DIR}"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  DUMP_FILE="${DATA_DIR}/pre-release-rollback-${STAMP}.sql"
  echo "Downloading ${PRE_RELEASE_DUMP_S3_URI} -> ${DUMP_FILE}"
  aws s3 cp "${PRE_RELEASE_DUMP_S3_URI}" "${DUMP_FILE}" --profile "${AWS_PROFILE:-yawp}"
else
  echo "Set PRE_RELEASE_DUMP_LOCAL or PRE_RELEASE_DUMP_S3_URI" >&2
  exit 1
fi

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "Dump not found: ${DUMP_FILE}" >&2
  exit 1
fi

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

echo "Recreating local database \"${TARGET_DB}\"..."
psql "${ADMIN_URL}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\" WITH (FORCE);"
psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"

echo "Restoring dump (no prisma migrate deploy — snapshot already includes schema)..."
cat "${DUMP_FILE}" | pg_dump_plain_pipe_to_psql "${DATABASE_URL}"

echo "Checking out code at ${PRE_RELEASE_GIT_REF}..."
git -C "${ROOT}" checkout "${PRE_RELEASE_GIT_REF}"

echo "Generating Prisma client for checked-out schema..."
(
  cd "${ROOT}/packages/prisma"
  DATABASE_URL="${DATABASE_URL}" bunx prisma generate
)

echo "Done. App code is at ${PRE_RELEASE_GIT_REF}; DB matches dump. To return: git checkout -"
