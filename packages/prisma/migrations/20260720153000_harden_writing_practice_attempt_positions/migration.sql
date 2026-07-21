SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- Give every historical attempt a stable sequence position. The legacy
-- progress calculation counted chronological rows up to problemCount, even
-- when a deliberately-cycled prompt id repeated. Preserve that exact behavior:
-- the first problemCount rows receive positions 1..N and later rows remain
-- available for audit without inflating completion.
ALTER TABLE "WritingPracticeAttempt"
  ADD COLUMN "position" INTEGER,
  ADD COLUMN "countsTowardProgress" BOOLEAN NOT NULL DEFAULT true;

WITH ordered AS (
  SELECT
    attempt."id",
    attempt."classAssignmentId",
    attempt."membershipId",
    assignment."problemCount",
    ROW_NUMBER() OVER (
      PARTITION BY attempt."classAssignmentId", attempt."membershipId"
      ORDER BY attempt."createdAt" ASC, attempt."id" ASC
    )::INTEGER AS "all_rank"
  FROM "WritingPracticeAttempt" AS attempt
  JOIN "WritingPracticeClassAssignment" AS deployment
    ON deployment."id" = attempt."classAssignmentId"
  JOIN "WritingPracticeAssignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
),
classified AS (
  SELECT
    ordered."id",
    ordered."all_rank",
    ordered."problemCount",
    ordered."all_rank" <= ordered."problemCount" AS "credited"
  FROM ordered
)
UPDATE "WritingPracticeAttempt" AS attempt
SET
  "position" = CASE
    WHEN classified."credited" THEN classified."all_rank"
    ELSE classified."problemCount" + classified."all_rank"
  END,
  "countsTowardProgress" = classified."credited"
FROM classified
WHERE attempt."id" = classified."id";

ALTER TABLE "WritingPracticeAttempt"
  ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX "WritingPracticeAttempt_classAssignmentId_membershipId_position_key"
  ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "position");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "WritingPracticeAttempt" AS attempt
    JOIN "WritingPracticeClassAssignment" AS deployment
      ON deployment."id" = attempt."classAssignmentId"
    JOIN "WritingPracticeAssignment" AS assignment
      ON assignment."id" = deployment."assignmentId"
    WHERE attempt."countsTowardProgress"
      AND (
        attempt."position" < 1
        OR attempt."position" > assignment."problemCount"
      )
  ) THEN
    RAISE EXCEPTION 'credited writing-practice positions exceed assignment bounds';
  END IF;
END $$;
