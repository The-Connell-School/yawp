#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PRISMA_DIR="$ROOT_DIR/packages/prisma"
BASE_CUTOFF="20260706120000_drop_feature_flags"
FEATURE_CUTOFF="20260710130000_add_reporter_growth_plan"
RUN_ID="${COMBINED_REHEARSAL_RUN_ID:-$$}"
SCRATCH_DATABASE="yawp_combined_rehearsal_${RUN_ID}"
RECOVERY_DATABASE="yawp_combined_recovery_${RUN_ID}"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/yawp-combined-rehearsal.XXXXXX")"
BASE_COPY="$TEMP_DIR/base-prisma"
FEATURE_COPY="$TEMP_DIR/feature-prisma"
SNAPSHOT="$TEMP_DIR/pre-hardening.dump"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PG_DATABASE_USER="${PG_DATABASE_USER:-${WS_DATABASE_USER:-postgres}}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

if [[ "$DATABASE_URL" != *"@127.0.0.1:"* && "$DATABASE_URL" != *"@localhost:"* ]]; then
  echo "Refusing to create rehearsal databases outside local PostgreSQL" >&2
  exit 1
fi

SERVER_URL="${DATABASE_URL%/*}"
ADMIN_URL="$SERVER_URL/postgres"
SCRATCH_URL="$SERVER_URL/$SCRATCH_DATABASE"
RECOVERY_URL="$SERVER_URL/$RECOVERY_DATABASE"

cleanup() {
  dropdb --if-exists --force --maintenance-db="$ADMIN_URL" "$SCRATCH_DATABASE" >/dev/null 2>&1 || true
  dropdb --if-exists --force --maintenance-db="$ADMIN_URL" "$RECOVERY_DATABASE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

copy_migrations_through() {
  local destination="$1"
  local cutoff="$2"

  mkdir -p "$destination"
  cp "$PRISMA_DIR/schema.prisma" "$destination/schema.prisma"
  cp -R "$PRISMA_DIR/migrations" "$destination/migrations"

  local migration
  for migration in "$destination"/migrations/20*; do
    if [[ "$(basename "$migration")" > "$cutoff" ]]; then
      rm -rf "$migration"
    fi
  done
}

deploy_migrations() {
  local url="$1"
  local prisma_directory="$2"
  DATABASE_URL="$url" \
    REHEARSAL_PRISMA_DIR="$prisma_directory" \
    bunx prisma migrate deploy --config "$PRISMA_DIR/prisma.rehearsal.config.ts"
}

expect_preflight_failure() {
  local label="$1"
  local mutation="$2"

  if psql "$SCRATCH_URL" \
    -v ON_ERROR_STOP=1 \
    -c "BEGIN; $mutation" \
    -f "$PRISMA_DIR/scripts/combined-feature-preflight.sql" \
    >/dev/null 2>&1; then
    echo "preflight_negative=$label result=unexpected-pass" >&2
    exit 1
  fi

  echo "preflight_negative=$label result=rejected"
}

create_snapshot() {
  if [[ -n "${PG_CONTAINER_ID:-}" ]]; then
    docker exec "$PG_CONTAINER_ID" \
      pg_dump --username="$PG_DATABASE_USER" --dbname="$SCRATCH_DATABASE" --format=custom \
      >"$SNAPSHOT"
    return
  fi

  "$PG_DUMP_BIN" "$SCRATCH_URL" --format=custom --file="$SNAPSHOT"
}

restore_snapshot() {
  if [[ -n "${PG_CONTAINER_ID:-}" ]]; then
    docker exec -i "$PG_CONTAINER_ID" \
      pg_restore \
      --username="$PG_DATABASE_USER" \
      --dbname="$RECOVERY_DATABASE" \
      --no-owner \
      --no-privileges \
      <"$SNAPSHOT"
    return
  fi

  "$PG_RESTORE_BIN" --no-owner --no-privileges --dbname="$RECOVERY_URL" "$SNAPSHOT"
}

copy_migrations_through "$BASE_COPY" "$BASE_CUTOFF"
copy_migrations_through "$FEATURE_COPY" "$FEATURE_CUTOFF"

createdb --maintenance-db="$ADMIN_URL" "$SCRATCH_DATABASE"
echo "rehearsal_database=$SCRATCH_DATABASE"
echo "phase=origin-equivalent"
deploy_migrations "$SCRATCH_URL" "$BASE_COPY"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-preflight.sql"

echo "phase=feature-branches-before-hardening"
deploy_migrations "$SCRATCH_URL" "$FEATURE_COPY"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-rehearsal-fixture.sql"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-preflight.sql"

expect_preflight_failure \
  "writing-problem-count" \
  "UPDATE \"WritingPracticeAssignment\" SET \"problemCount\" = 0 WHERE \"id\" = 'rehearsal-writing-assignment';"
expect_preflight_failure \
  "writing-attempt-status" \
  "UPDATE \"WritingPracticeAttempt\" SET \"status\" = 'invalid-status' WHERE \"id\" = 'rehearsal-attempt-1';"
expect_preflight_failure \
  "class-insight-status" \
  "UPDATE \"ClassAssignmentInsight\" SET \"status\" = 'invalid-status' WHERE \"id\" = 'rehearsal-class-insight';"
expect_preflight_failure \
  "reporter-conversation-tenant" \
  "UPDATE \"ReporterConversation\" SET \"organizationId\" = 'rehearsal-org-b' WHERE \"id\" = 'rehearsal-conversation';"
expect_preflight_failure \
  "reporter-growth-status" \
  "UPDATE \"ReporterGrowthPlan\" SET \"status\" = 'invalid-status' WHERE \"id\" = 'rehearsal-growth-plan';"

create_snapshot
echo "snapshot=created"

echo "phase=all-hardening-migrations"
deploy_migrations "$SCRATCH_URL" "$PRISMA_DIR"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-postcheck.sql"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-rehearsal-assertions.sql"
psql "$SCRATCH_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-tenant-negative-proof.sql"

echo "phase=idempotent-redeploy"
deploy_migrations "$SCRATCH_URL" "$PRISMA_DIR"

echo "phase=snapshot-recovery"
createdb --maintenance-db="$ADMIN_URL" "$RECOVERY_DATABASE"
restore_snapshot
psql "$RECOVERY_URL" -v ON_ERROR_STOP=1 \
  -f "$PRISMA_DIR/scripts/combined-feature-preflight.sql"
psql "$RECOVERY_URL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT 'recovered_attempts=' || COUNT(*) FROM \"WritingPracticeAttempt\"
   UNION ALL
   SELECT 'recovered_growth_plans=' || COUNT(*) FROM \"ReporterGrowthPlan\";"

echo "rehearsal_result=pass"
