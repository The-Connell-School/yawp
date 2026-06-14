#!/usr/bin/env bash
# Staging rehearsal against a production database copy (local only).
#
# Loads a fresh production snapshot, runs precheck → migrate deploy → staging verify,
# then optional automated tests and app build.
#
# Prerequisites:
#   cp scripts/production-sync.env.example scripts/production-sync.env
#   # fill bastion + RDS + local DATABASE_URL (dedicated local DB name)
#
# Full rehearsal from live production:
#   set -a && source scripts/production-sync.env && set +a
#   YAWP_CONFIRM=yes ./scripts/staging-org-membership-rehearsal.sh
#
# Rehearsal from an existing plain SQL dump (skip bastion):
#   YAWP_CONFIRM=yes PRELOADED_DUMP=/path/to/production-live.sql ./scripts/staging-org-membership-rehearsal.sh
#
# Skip e2e (faster):
#   YAWP_SKIP_E2E=1 YAWP_CONFIRM=yes ./scripts/staging-org-membership-rehearsal.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "${ROOT}/scripts/lib/pg-dump-plain-to-psql.sh"

: "${DATABASE_URL:?Set DATABASE_URL to a dedicated LOCAL database (not production)}"

if [[ "${YAWP_CONFIRM:-}" != "yes" ]]; then
  echo "This drops and recreates the local database in DATABASE_URL." >&2
  echo "Re-run with YAWP_CONFIRM=yes when ready." >&2
  exit 1
fi

if [[ "${DATABASE_URL}" != *localhost* && "${DATABASE_URL}" != *127.0.0.1* ]]; then
  echo "Refusing to run staging rehearsal against non-local DATABASE_URL." >&2
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

recreate_local_db() {
  echo "Recreating local database \"${TARGET_DB}\"..."
  psql "${ADMIN_URL}" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\" WITH (FORCE);"
  psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${TARGET_DB}\";"
}

echo "== Staging rehearsal on branch $(git -C "${ROOT}" rev-parse --short HEAD) =="

if [[ -n "${PRELOADED_DUMP:-}" ]]; then
  if [[ ! -f "${PRELOADED_DUMP}" ]]; then
    echo "Dump not found: ${PRELOADED_DUMP}" >&2
    exit 1
  fi
  recreate_local_db
  echo "Restoring preloaded dump: ${PRELOADED_DUMP}"
  cat "${PRELOADED_DUMP}" | pg_dump_plain_pipe_to_psql "${DATABASE_URL}"
elif [[ -f "${ROOT}/scripts/production-sync.env" ]]; then
  echo "Syncing production snapshot via bastion (migrate deferred until precheck)..."
  # shellcheck source=/dev/null
  set -a
  source "${ROOT}/scripts/production-sync.env"
  set +a
  export YAWP_SKIP_MIGRATE=1
  bash "${ROOT}/scripts/sync-production-db-to-local.sh"
else
  echo "Set PRELOADED_DUMP or create scripts/production-sync.env" >&2
  exit 1
fi

echo "== Pre-migration precheck =="
(
  cd "${ROOT}/packages/prisma"
  DATABASE_URL="${DATABASE_URL}" bun run scripts/org-membership-precheck.ts
)

echo "== Migrate deploy =="
(
  cd "${ROOT}/packages/prisma"
  DATABASE_URL="${DATABASE_URL}" bunx prisma migrate deploy
  DATABASE_URL="${DATABASE_URL}" bunx prisma generate
)

echo "== Post-migration staging verify =="
(
  cd "${ROOT}/packages/prisma"
  DATABASE_URL="${DATABASE_URL}" bun run scripts/org-membership-staging-verify.ts
)

echo "== Prisma verification tests =="
(
  cd "${ROOT}/packages/prisma"
  bun test scripts/org-membership-precheck.test.ts scripts/org-membership-postcheck.test.ts scripts/org-membership-staging-verify.test.ts
)

echo "== Web app unit tests (auth + org membership) =="
(
  cd "${ROOT}/services/web-app"
  DATABASE_URL="${DATABASE_URL}" bun test app/utils/auth.server.test.ts app/utils/student-preview.server.test.ts
)

if [[ -z "${YAWP_SKIP_E2E:-}" ]]; then
  echo "== E2E smoke (isolated e2e DB; validates app against OrgMembership schema) =="
  (
    cd "${ROOT}/services/web-app"
    bun run test:e2e:prepare
    bun run test:e2e:smoke
  )
else
  echo "Skipping e2e (YAWP_SKIP_E2E set)."
fi

echo "== Production-like app build =="
(
  cd "${ROOT}"
  bun web-app:build
)

cat <<EOF

Staging rehearsal automated gates passed.

Next: manual smoke on restored prod data
  cd services/web-app && DATABASE_URL="${DATABASE_URL}" bun dev

Use sampleAccounts emails from staging-verify JSON above.
Manual checklist: docs/superpowers/plans/2026-06-13-org-membership-cutover-runbook.md

Before production cutover:
  1. Take final RDS snapshot during maintenance
  2. bun prisma:migrate-remote production   (or migrate deploy via tunnel)
  3. Deploy app from $(git -C "${ROOT}" rev-parse --short HEAD)
  4. bun run --cwd packages/prisma scripts/org-membership-staging-verify.ts (via tunnel)
  5. Production manual smoke (~5 min) then open traffic

EOF
