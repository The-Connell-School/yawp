#!/usr/bin/env bash
# Prove 20261008001200 labels RubricRevision under `prisma migrate deploy`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRISMA_DIR="$ROOT/packages/prisma"
MIGRATION_NAME="20261008001200_set_holistic_tier_hornbuckle"
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/qa_holistic_label_proof}"
ADMIN_URL="${ADMIN_DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
DB_NAME="${DB_NAME:-qa_holistic_label_proof}"
TARGET_ID="cmur0glku00d401l1cg6ou25q"

export PATH="$ROOT/node_modules/.bin:$PATH"

psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$DB_NAME\" WITH (FORCE);"
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$DB_NAME\";"

TMP_MIG="$(mktemp -d)"
trap 'rm -rf "$TMP_MIG"; mv "$TMP_MIG/$MIGRATION_NAME" "$PRISMA_DIR/migrations/$MIGRATION_NAME" 2>/dev/null || true' EXIT

mv "$PRISMA_DIR/migrations/$MIGRATION_NAME" "$TMP_MIG/"

(
  cd "$PRISMA_DIR"
  DATABASE_URL="$DB_URL" bun run prisma migrate deploy
)

psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "Organization" ("id","createdAt","updatedAt","name")
VALUES ('org-holistic-proof', now(), now(), 'Holistic proof org');
INSERT INTO "AssignmentType" (
  "id","createdAt","updatedAt","title","position",
  "gradingOutputSchemaJson","rubricJson","scoringScaleJson"
) VALUES (
  'cmur0glku00d401l1cg6ou25q',
  now(),
  now(),
  'In-class Essay/Analysis (Cristo Rey)',
  1,
  '{"responseShape":"categories_overall_comment","schemaVersion":1,"teacherNotesEnabled":true}'::jsonb,
  '{"categories":[{"key":"thesis","label":"Thesis","description":"Clear thesis","weight":1}]}'::jsonb,
  '{"type":"rubric_points","minScore":0,"maxScore":20,"step":1}'::jsonb
);
SQL

mv "$TMP_MIG/$MIGRATION_NAME" "$PRISMA_DIR/migrations/$MIGRATION_NAME"
trap - EXIT

(
  cd "$PRISMA_DIR"
  DATABASE_URL="$DB_URL" bun run prisma migrate deploy
)

echo "--- RubricRevision label proof (latest v2 for assignment type) ---"
psql "$DB_URL" -v ON_ERROR_STOP=1 -c "
SELECT version, \"createdBy\", reason
FROM \"RubricRevision\"
WHERE \"rubricName\" = 'assignment-type:${TARGET_ID}'
ORDER BY version DESC
LIMIT 1;
"
