\set ON_ERROR_STOP on

DO $$
BEGIN
  IF to_regclass('public."SubmissionActivity"') IS NULL THEN
    RAISE EXCEPTION 'SubmissionActivity table is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute attribute
    JOIN pg_class relation ON relation.oid = attribute.attrelid
    JOIN pg_attrdef default_value
      ON default_value.adrelid = relation.oid
      AND default_value.adnum = attribute.attnum
    WHERE relation.relname = 'Organization'
      AND attribute.attname = 'submissionActivityEnabled'
      AND pg_get_expr(default_value.adbin, default_value.adrelid) = 'false'
  ) THEN
    RAISE EXCEPTION 'submissionActivityEnabled default is not false';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_indexes
    WHERE tablename = 'SubmissionActivity'
      AND indexname IN (
        'SubmissionActivity_submissionId_createdAt_idx',
        'SubmissionActivity_organizationId_createdAt_idx',
        'SubmissionActivity_actorMembershipId_createdAt_idx',
        'SubmissionActivity_eventType_createdAt_idx'
      )
  ) <> 4 THEN
    RAISE EXCEPTION 'SubmissionActivity indexes are incomplete';
  END IF;

  IF EXISTS (SELECT 1 FROM "SubmissionActivity") THEN
    RAISE EXCEPTION 'fresh migration falsely backfilled submission activity';
  END IF;
END $$;

CREATE TEMP TABLE submission_activity_proof_state AS
SELECT
  submission.id AS submission_id,
  membership."organizationId" AS organization_id,
  membership.id AS actor_membership_id,
  submission."numericPercentage" AS original_percentage,
  submission."updatedAt" AS original_updated_at
FROM "Submission" submission
JOIN "Document" document ON document.id = submission."documentId"
JOIN "OrgMembership" membership ON membership.id = document."membershipId"
WHERE membership."organizationId" IS NOT NULL
ORDER BY submission."createdAt"
LIMIT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM submission_activity_proof_state) THEN
    RAISE EXCEPTION 'seeded proof submission is missing';
  END IF;
END $$;

BEGIN;

UPDATE "Submission" submission
SET "numericPercentage" = 91,
    "updatedAt" = CURRENT_TIMESTAMP
FROM submission_activity_proof_state proof
WHERE submission.id = proof.submission_id;

INSERT INTO "SubmissionActivity" (
  id,
  "submissionId",
  "organizationId",
  "actorMembershipId",
  "eventType",
  source,
  "occurredAfterRelease",
  changes
)
SELECT
  'submission-activity-db-proof',
  proof.submission_id,
  proof.organization_id,
  proof.actor_membership_id,
  'submission.grade_updated',
  'db-proof',
  true,
  jsonb_build_object(
    'numericPercentage',
    jsonb_build_object('before', proof.original_percentage, 'after', 91)
  )
FROM submission_activity_proof_state proof;

COMMIT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "SubmissionActivity" activity
    JOIN submission_activity_proof_state proof
      ON proof.submission_id = activity."submissionId"
    WHERE activity.id = 'submission-activity-db-proof'
      AND activity."organizationId" = proof.organization_id
      AND activity."actorMembershipId" = proof.actor_membership_id
      AND activity."occurredAfterRelease" = true
      AND activity.changes->'numericPercentage'->>'after' = '91'
  ) THEN
    RAISE EXCEPTION 'committed activity record did not persist exactly';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "Submission" submission
    JOIN submission_activity_proof_state proof
      ON proof.submission_id = submission.id
    WHERE submission."numericPercentage" = 91
  ) THEN
    RAISE EXCEPTION 'committed grade mutation did not persist';
  END IF;
END $$;

BEGIN;
DELETE FROM "SubmissionActivity"
WHERE id = 'submission-activity-db-proof';
UPDATE "Submission" submission
SET "numericPercentage" = proof.original_percentage,
    "updatedAt" = proof.original_updated_at
FROM submission_activity_proof_state proof
WHERE submission.id = proof.submission_id;
COMMIT;

BEGIN;
UPDATE "Submission" submission
SET "numericPercentage" = 92
FROM submission_activity_proof_state proof
WHERE submission.id = proof.submission_id;
INSERT INTO "SubmissionActivity" (
  id,
  "submissionId",
  "organizationId",
  "actorMembershipId",
  "eventType",
  source,
  "occurredAfterRelease",
  changes
)
SELECT
  'submission-activity-rollback-proof',
  proof.submission_id,
  proof.organization_id,
  proof.actor_membership_id,
  'submission.grade_updated',
  'db-proof',
  true,
  '{}'::jsonb
FROM submission_activity_proof_state proof;
ROLLBACK;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "SubmissionActivity"
    WHERE id IN (
      'submission-activity-db-proof',
      'submission-activity-rollback-proof'
    )
  ) THEN
    RAISE EXCEPTION 'proof activity cleanup or transaction rollback failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "Submission" submission
    JOIN submission_activity_proof_state proof
      ON proof.submission_id = submission.id
    WHERE submission."numericPercentage" IS DISTINCT FROM proof.original_percentage
      OR submission."updatedAt" IS DISTINCT FROM proof.original_updated_at
  ) THEN
    RAISE EXCEPTION 'proof grade cleanup or transaction rollback failed';
  END IF;
END $$;

SELECT
  'submission activity database proof passed' AS result,
  (SELECT count(*) FROM "SubmissionActivity") AS final_activity_count;
