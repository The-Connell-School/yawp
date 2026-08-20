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

  IF (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'SubmissionActivity'
      AND (
        (column_name = 'actorType' AND data_type = 'text' AND is_nullable = 'NO')
        OR (column_name = 'actorName' AND data_type = 'text' AND is_nullable = 'YES')
        OR (column_name = 'actorEmail' AND data_type = 'text' AND is_nullable = 'YES')
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'SubmissionActivity actor snapshot columns are invalid';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_constraint
    WHERE conname IN (
      'SubmissionActivity_submissionId_fkey',
      'SubmissionActivity_organizationId_fkey',
      'SubmissionActivity_actorMembershipId_organizationId_fkey'
    )
      AND contype = 'f'
  ) <> 3 THEN
    RAISE EXCEPTION 'SubmissionActivity foreign keys are incomplete';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SubmissionActivity_actorMembershipId_organizationId_fkey'
      AND array_length(conkey, 1) = 2
      AND array_length(confkey, 1) = 2
      AND pg_get_constraintdef(oid) LIKE '%actorMembershipId%organizationId%'
  ) THEN
    RAISE EXCEPTION 'actor membership is not constrained to the activity tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'SubmissionActivity_organizationId_fkey'
      AND confdeltype = 'c'
  ) THEN
    RAISE EXCEPTION 'organization activity cleanup is not cascade-compatible';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgname IN (
      'SubmissionActivity_tenant_guard',
      'OrgMembership_detach_submission_activity_actor',
      'OrgMembership_submission_activity_owner_tenant_guard',
      'Document_submission_activity_tenant_guard',
      'SubmissionActivity_immutability_guard'
    )
      AND NOT tgisinternal
  ) <> 5 THEN
    RAISE EXCEPTION 'SubmissionActivity tenant, parent, immutability, or actor-detach trigger is missing';
  END IF;

  IF EXISTS (SELECT 1 FROM "SubmissionActivity") THEN
    RAISE EXCEPTION 'fresh migration falsely backfilled submission activity';
  END IF;
END $$;

SELECT 'activity index' AS kind, indexname AS name
FROM pg_indexes
WHERE tablename = 'SubmissionActivity'
ORDER BY indexname;

SELECT 'activity foreign key' AS kind, conname AS name, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname LIKE 'SubmissionActivity%fkey'
ORDER BY conname;

CREATE TEMP TABLE submission_activity_proof_state AS
SELECT
  submission.id AS submission_id,
  document.id AS document_id,
  membership."organizationId" AS organization_id,
  membership.id AS owner_membership_id,
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

INSERT INTO "Organization" (id, name)
VALUES ('submission-activity-other-org', 'Submission Activity Other Tenant');
INSERT INTO "User" (id, email, name)
VALUES ('submission-activity-other-user', 'submission-activity-other@example.test', 'Other Tenant Teacher');
INSERT INTO "OrgMembership" (id, "userId", "organizationId", role)
VALUES (
  'submission-activity-other-membership',
  'submission-activity-other-user',
  'submission-activity-other-org',
  'TEACHER'
);

DO $$
DECLARE
  proof submission_activity_proof_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT proof FROM submission_activity_proof_state;
  BEGIN
    INSERT INTO "SubmissionActivity" (
      id,
      "submissionId",
      "organizationId",
      "actorMembershipId",
      "actorType",
      "eventType",
      source,
      "occurredAfterRelease",
      changes
    ) VALUES (
      'submission-activity-cross-tenant-proof',
      proof.submission_id,
      proof.organization_id,
      'submission-activity-other-membership',
      'human',
      'submission.grade_updated',
      'db-proof',
      true,
      '{}'::jsonb
    );
    RAISE EXCEPTION 'cross-tenant actor membership unexpectedly succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO "SubmissionActivity" (
      id,
      "submissionId",
      "organizationId",
      "actorMembershipId",
      "actorType",
      "eventType",
      source,
      changes
    ) VALUES (
      'submission-activity-wrong-tenant-proof',
      proof.submission_id,
      'submission-activity-other-org',
      NULL,
      'system',
      'submission.grade_updated',
      'db-proof',
      '{}'::jsonb
    );
    RAISE EXCEPTION 'submission/activity tenant mismatch unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;
END $$;

INSERT INTO "User" (id, email, name)
VALUES (
  'submission-activity-detach-user',
  'submission-activity-detach@example.test',
  'Detachable Audit Actor'
);
INSERT INTO "OrgMembership" (id, "userId", "organizationId", role)
SELECT
  'submission-activity-detach-membership',
  'submission-activity-detach-user',
  proof.organization_id,
  'TEACHER'
FROM submission_activity_proof_state proof;
INSERT INTO "SubmissionActivity" (
  id,
  "submissionId",
  "organizationId",
  "actorMembershipId",
  "actorType",
  "eventType",
  source,
  changes
)
SELECT
  'submission-activity-detach-proof',
  proof.submission_id,
  proof.organization_id,
  'submission-activity-detach-membership',
  'human',
  'submission.comment_created',
  'db-proof',
  '{}'::jsonb
FROM submission_activity_proof_state proof;

DO $$
BEGIN
  BEGIN
    UPDATE "OrgMembership"
    SET "organizationId" = 'submission-activity-other-org'
    WHERE id = 'submission-activity-detach-membership';
    RAISE EXCEPTION 'audited actor tenant reassignment unexpectedly succeeded';
  EXCEPTION
    WHEN foreign_key_violation THEN NULL;
  END;
END $$;

DELETE FROM "OrgMembership"
WHERE id = 'submission-activity-detach-membership';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "SubmissionActivity" activity
    JOIN submission_activity_proof_state proof
      ON proof.submission_id = activity."submissionId"
    WHERE activity.id = 'submission-activity-detach-proof'
      AND activity."actorMembershipId" IS NULL
      AND activity."organizationId" = proof.organization_id
  ) THEN
    RAISE EXCEPTION 'membership deletion did not detach only the actor link';
  END IF;
END $$;
DELETE FROM "SubmissionActivity" WHERE id = 'submission-activity-detach-proof';
DELETE FROM "User" WHERE id = 'submission-activity-detach-user';

INSERT INTO "SubmissionActivity" (
  id,
  "submissionId",
  "organizationId",
  "actorMembershipId",
  "actorType",
  "eventType",
  source,
  changes
)
SELECT
  'submission-activity-parent-anchor-proof',
  proof.submission_id,
  proof.organization_id,
  NULL,
  'system',
  'submission.grade_updated',
  'db-proof',
  '{}'::jsonb
FROM submission_activity_proof_state proof;

DO $$
DECLARE
  proof submission_activity_proof_state%ROWTYPE;
BEGIN
  SELECT * INTO STRICT proof FROM submission_activity_proof_state;

  BEGIN
    UPDATE "OrgMembership"
    SET "organizationId" = 'submission-activity-other-org'
    WHERE id = proof.owner_membership_id;
    RAISE EXCEPTION 'submission owner tenant reassignment unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE "Document"
    SET "membershipId" = 'submission-activity-other-membership'
    WHERE id = proof.document_id;
    RAISE EXCEPTION 'audited document tenant reassignment unexpectedly succeeded';
  EXCEPTION
    WHEN check_violation THEN NULL;
  END;

  IF NOT EXISTS (
    SELECT 1
    FROM "Document" document
    JOIN "OrgMembership" owner ON owner.id = document."membershipId"
    JOIN "SubmissionActivity" activity
      ON activity."submissionId" = proof.submission_id
    WHERE document.id = proof.document_id
      AND document."membershipId" = proof.owner_membership_id
      AND owner."organizationId" = proof.organization_id
      AND activity.id = 'submission-activity-parent-anchor-proof'
      AND activity."organizationId" = proof.organization_id
  ) THEN
    RAISE EXCEPTION 'failed parent reassignment changed the durable tenant anchor';
  END IF;
END $$;

DELETE FROM "SubmissionActivity"
WHERE id = 'submission-activity-parent-anchor-proof';

CREATE TEMP TABLE submission_activity_tenant_negative AS
WITH attempted AS (
  UPDATE "Submission" submission
  SET score = 'forbidden-cross-tenant-write'
  FROM submission_activity_proof_state proof
  WHERE submission.id = proof.submission_id
    AND EXISTS (
      SELECT 1
      FROM "Document" document
      JOIN "OrgMembership" owner ON owner.id = document."membershipId"
      WHERE document.id = submission."documentId"
        AND owner."organizationId" = 'submission-activity-other-org'
    )
  RETURNING submission.id
)
SELECT count(*)::int AS mutated_count FROM attempted;

DO $$
BEGIN
  IF (SELECT mutated_count FROM submission_activity_tenant_negative) <> 0 THEN
    RAISE EXCEPTION 'cross-tenant released-grade mutation unexpectedly matched';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM "SubmissionActivity" activity
    JOIN submission_activity_proof_state proof
      ON proof.submission_id = activity."submissionId"
    WHERE activity."organizationId" = 'submission-activity-other-org'
  ) THEN
    RAISE EXCEPTION 'cross-tenant activity read unexpectedly returned rows';
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
  "actorType",
  "actorName",
  "actorEmail",
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
  'human',
  'Database Proof Actor',
  'db-proof@example.test',
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
      AND activity."actorType" = 'human'
      AND activity."actorName" = 'Database Proof Actor'
      AND activity."actorEmail" = 'db-proof@example.test'
      AND activity.changes->'numericPercentage'->>'before'
        IS NOT DISTINCT FROM proof.original_percentage::text
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

SELECT
  activity."organizationId",
  activity."actorMembershipId",
  activity."actorType",
  activity."actorName",
  activity."actorEmail",
  activity."eventType",
  activity."occurredAfterRelease",
  activity.changes
FROM "SubmissionActivity" activity
WHERE activity.id = 'submission-activity-db-proof';

BEGIN;
DELETE FROM "SubmissionActivity"
WHERE id = 'submission-activity-db-proof';
UPDATE "Submission" submission
SET "numericPercentage" = proof.original_percentage,
    "updatedAt" = proof.original_updated_at
FROM submission_activity_proof_state proof
WHERE submission.id = proof.submission_id;
COMMIT;

DELETE FROM "OrgMembership" WHERE id = 'submission-activity-other-membership';
DELETE FROM "User" WHERE id = 'submission-activity-other-user';
DELETE FROM "Organization" WHERE id = 'submission-activity-other-org';

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
  "actorType",
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
  'human',
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
  (SELECT count(*) FROM "SubmissionActivity") AS final_activity_count,
  (SELECT mutated_count FROM submission_activity_tenant_negative) AS cross_tenant_mutation_count;
