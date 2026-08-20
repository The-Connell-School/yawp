#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" && -f "$repo_root/.worktree-local/config.env" ]]; then
  # shellcheck disable=SC1091
  source "$repo_root/.worktree-local/config.env"
fi

case "${DATABASE_URL:-}" in
  postgresql://*@127.0.0.1:*/*) ;;
  *)
    echo "Refusing fresh migration proof outside local PostgreSQL." >&2
    exit 1
    ;;
esac

proof_database="yawp_submission_activity_proof_$(date +%s)_$$"
server_url="${DATABASE_URL%/*}"
maintenance_url="$server_url/postgres"
proof_url="$server_url/$proof_database"

cleanup() {
  dropdb --if-exists --maintenance-db="$maintenance_url" "$proof_database"
}
trap cleanup EXIT

echo "Creating isolated database: $proof_database"
createdb --maintenance-db="$maintenance_url" "$proof_database"

echo "Preflight: activity schema must not exist"
psql "$proof_url" --no-psqlrc --tuples-only --command \
  "SELECT to_regclass('public.\"SubmissionActivity\"') IS NULL AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Organization' AND column_name = 'submissionActivityEnabled');"

export DATABASE_URL="$proof_url"
cd "$repo_root"

echo "Applying complete migration chain"
bun run --cwd packages/prisma prisma migrate deploy

echo "Validating final Prisma schema and migration status"
bun run --cwd packages/prisma prisma validate
bun run --cwd packages/prisma prisma migrate status

echo "Seeding isolated proof fixtures"
bun run --cwd packages/prisma seed-local-dev

echo "Running schema, foreign-key, no-backfill, commit, rollback, and cleanup assertions"
psql "$proof_url" --no-psqlrc --file "$repo_root/scripts/prove-submission-activity-db.sql"

echo "Fresh migration proof passed: $proof_database"
