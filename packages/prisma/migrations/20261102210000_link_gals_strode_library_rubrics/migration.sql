-- Link GALS Claims and Strode Autobiography assignment types to their library rubrics.
-- Idempotent: safe after 20261102193000 / 20261102194500 when rubricId was left null.
SET lock_timeout = '5s';

UPDATE "AssignmentType" AS at
SET
  "rubricId" = lib."id",
  "updatedAt" = NOW()
FROM "Rubric" AS lib
WHERE lib."name" = 'gals-claims'
  AND at."kind" = 'gals_claims'
  AND at."rubricId" IS DISTINCT FROM lib."id";

UPDATE "AssignmentType" AS at
SET
  "rubricId" = lib."id",
  "updatedAt" = NOW()
FROM "Rubric" AS lib
WHERE lib."name" = 'strode-eng101-essay-2-autobiography'
  AND at."kind" = 'strode_autobiography'
  AND at."rubricId" IS DISTINCT FROM lib."id";

-- Title-based kind wiring when kind was not set (prod title drift).
UPDATE "AssignmentType" AS at
SET
  "kind" = 'gals_claims',
  "rubricId" = lib."id",
  "rubricJson" = NULL,
  "scoringScaleJson" = NULL,
  "gradingPromptConfigJson" = NULL,
  "gradingOutputSchemaJson" = NULL,
  "gradingCalibrationNotes" = NULL,
  "gradingAssistantVersion" = GREATEST(at."gradingAssistantVersion", 1) + 1,
  "updatedAt" = NOW()
FROM "Rubric" AS lib
WHERE lib."name" = 'gals-claims'
  AND at."kind" IS DISTINCT FROM 'gals_claims'
  AND (
    lower(trim(at."title")) IN ('claims', 'claims assignment', 'gals claims')
    OR lower(trim(at."title")) LIKE 'claims %'
    OR lower(trim(at."title")) LIKE '%gals%claim%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentType" other
    WHERE other."kind" = 'gals_claims'
      AND other."id" <> at."id"
  );

UPDATE "AssignmentType" AS at
SET
  "kind" = 'strode_autobiography',
  "rubricId" = lib."id",
  "rubricJson" = NULL,
  "scoringScaleJson" = NULL,
  "gradingPromptConfigJson" = NULL,
  "gradingOutputSchemaJson" = NULL,
  "gradingCalibrationNotes" = NULL,
  "gradingAssistantVersion" = GREATEST(at."gradingAssistantVersion", 1) + 1,
  "updatedAt" = NOW()
FROM "Rubric" AS lib
WHERE lib."name" = 'strode-eng101-essay-2-autobiography'
  AND at."kind" IS DISTINCT FROM 'strode_autobiography'
  AND lower(trim(at."title")) LIKE '%autobiograph%'
  AND NOT EXISTS (
    SELECT 1
    FROM "AssignmentType" other
    WHERE other."kind" = 'strode_autobiography'
      AND other."id" <> at."id"
  );
