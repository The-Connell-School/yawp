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
upgrade_database="${proof_database}_upgrade"
server_url="${DATABASE_URL%/*}"
maintenance_url="$server_url/postgres"
proof_url="$server_url/$proof_database"
upgrade_url="$server_url/$upgrade_database"
activity_migration="20260820110000_add_submission_activity"
upgrade_migrations_dir="$(mktemp -d "$repo_root/packages/prisma/.activity-proof-upgrade.XXXXXX")"

cleanup() {
  dropdb --if-exists --maintenance-db="$maintenance_url" "$proof_database"
  dropdb --if-exists --maintenance-db="$maintenance_url" "$upgrade_database"
  rm -rf "$upgrade_migrations_dir"
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
echo "Checking migrated database for Prisma-schema drift"
bun run --cwd packages/prisma prisma migrate diff \
  --from-config-datasource \
  --to-schema schema.prisma \
  --exit-code

echo "Seeding isolated proof fixtures"
bun run --cwd packages/prisma seed-local-dev

echo "Running schema, foreign-key, no-backfill, commit, rollback, and cleanup assertions"
psql "$proof_url" --no-psqlrc --file "$repo_root/scripts/prove-submission-activity-db.sql"

echo "Fresh migration proof passed: $proof_database"

echo "Creating populated predecessor database: $upgrade_database"
createdb --maintenance-db="$maintenance_url" "$upgrade_database"

echo "Applying migrations through the activity migration predecessor"
mkdir -p "$upgrade_migrations_dir/migrations"
cp "$repo_root/packages/prisma/schema.prisma" "$upgrade_migrations_dir/schema.prisma"
cp "$repo_root/packages/prisma/prisma.config.ts" "$upgrade_migrations_dir/prisma.config.ts"
cp "$repo_root/packages/prisma/migrations/migration_lock.toml" "$upgrade_migrations_dir/migrations/migration_lock.toml"
while IFS= read -r migration_file; do
  migration_name="$(basename "$(dirname "$migration_file")")"
  if [[ "$migration_name" == "$activity_migration" ]]; then
    break
  fi
  cp -R "$(dirname "$migration_file")" "$upgrade_migrations_dir/migrations/$migration_name"
done < <(find "$repo_root/packages/prisma/migrations" -mindepth 2 -maxdepth 2 -name migration.sql | sort)
(
  cd "$upgrade_migrations_dir"
  DATABASE_URL="$upgrade_url" "$repo_root/packages/prisma/node_modules/.bin/prisma" migrate deploy
)

echo "Seeding representative pre-migration submission"
psql "$upgrade_url" --no-psqlrc --set ON_ERROR_STOP=on <<'SQL'
INSERT INTO "Organization" (id, name)
VALUES ('activity-upgrade-org', 'Activity Upgrade Proof');
INSERT INTO "User" (id, email, name)
VALUES ('activity-upgrade-user', 'activity-upgrade@example.test', 'Upgrade Student');
INSERT INTO "OrgMembership" (id, "userId", "organizationId", role)
VALUES ('activity-upgrade-membership', 'activity-upgrade-user', 'activity-upgrade-org', 'STUDENT');
INSERT INTO "AssignmentType" (id, title, position)
VALUES ('activity-upgrade-assignment-type', 'Upgrade Proof Essay', 999999);
INSERT INTO "Document" (id, title, text, html, "membershipId", "assignmentTypeId")
VALUES (
  'activity-upgrade-document',
  'Existing document',
  'Existing body',
  '<p>Existing body</p>',
  'activity-upgrade-membership',
  'activity-upgrade-assignment-type'
);
INSERT INTO "Submission" (
  id, title, text, html, "submittedAt", score, feedback,
  "numericPercentage", "letterGrade", "documentId"
)
VALUES (
  'activity-upgrade-submission',
  'Existing submission',
  'Existing frozen body',
  '<p>Existing frozen body</p>',
  '2026-08-01T12:00:00Z',
  '84% (B)',
  'Existing feedback',
  84,
  'B',
  'activity-upgrade-document'
);
SQL

before_submission="$(psql "$upgrade_url" --no-psqlrc --tuples-only --no-align --command \
  "SELECT row_to_json(snapshot)::text FROM (SELECT id, title, text, html, score, feedback, \"numericPercentage\", \"letterGrade\", \"documentId\" FROM \"Submission\" WHERE id = 'activity-upgrade-submission') snapshot;")"
before_count="$(psql "$upgrade_url" --no-psqlrc --tuples-only --no-align --command \
  'SELECT count(*) FROM "Submission";')"

echo "Applying activity migration to populated predecessor"
psql "$upgrade_url" --no-psqlrc --set ON_ERROR_STOP=on \
  --file "$repo_root/packages/prisma/migrations/$activity_migration/migration.sql"

after_submission="$(psql "$upgrade_url" --no-psqlrc --tuples-only --no-align --command \
  "SELECT row_to_json(snapshot)::text FROM (SELECT id, title, text, html, score, feedback, \"numericPercentage\", \"letterGrade\", \"documentId\" FROM \"Submission\" WHERE id = 'activity-upgrade-submission') snapshot;")"
after_count="$(psql "$upgrade_url" --no-psqlrc --tuples-only --no-align --command \
  'SELECT count(*) FROM "Submission";')"

[[ "$before_submission" == "$after_submission" ]] || {
  echo "Populated upgrade changed the existing submission." >&2
  exit 1
}
[[ "$before_count" == "$after_count" ]] || {
  echo "Populated upgrade changed the submission count." >&2
  exit 1
}

psql "$upgrade_url" --no-psqlrc --set ON_ERROR_STOP=on <<'SQL'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "SubmissionActivity") THEN
    RAISE EXCEPTION 'populated upgrade falsely backfilled activity';
  END IF;
  IF (SELECT "submissionActivityEnabled" FROM "Organization" WHERE id = 'activity-upgrade-org') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'populated organization rollout did not default false';
  END IF;
END $$;
SELECT
  'populated upgrade proof passed' AS result,
  (SELECT count(*) FROM "Submission" WHERE id = 'activity-upgrade-submission') AS preserved_submission_count,
  (SELECT count(*) FROM "SubmissionActivity") AS backfilled_activity_count,
  (SELECT "submissionActivityEnabled" FROM "Organization" WHERE id = 'activity-upgrade-org') AS rollout_enabled;
SQL

echo "Populated upgrade preserved submission: $after_submission"
echo "Populated migration proof passed: $upgrade_database"
