-- Give every historical attempt a stable sequence position. Existing rows
-- predate persisted positions, so preserve their chronological progress order
-- while quarantining retries/replays that share a prompt id. Quarantined rows
-- remain available for audit but cannot inflate assignment completion.
ALTER TABLE "WritingPracticeAttempt"
  ADD COLUMN "position" INTEGER,
  ADD COLUMN "countsTowardProgress" BOOLEAN NOT NULL DEFAULT true;

WITH ordered AS (
  SELECT
    attempt."id",
    attempt."classAssignmentId",
    attempt."membershipId",
    attempt."promptId",
    assignment."problemCount",
    ROW_NUMBER() OVER (
      PARTITION BY attempt."classAssignmentId", attempt."membershipId"
      ORDER BY attempt."createdAt" ASC, attempt."id" ASC
    )::INTEGER AS "all_rank",
    ROW_NUMBER() OVER (
      PARTITION BY attempt."classAssignmentId", attempt."membershipId", attempt."promptId"
      ORDER BY attempt."createdAt" ASC, attempt."id" ASC
    )::INTEGER AS "replay_rank"
  FROM "WritingPracticeAttempt" AS attempt
  JOIN "WritingPracticeClassAssignment" AS deployment
    ON deployment."id" = attempt."classAssignmentId"
  JOIN "WritingPracticeAssignment" AS assignment
    ON assignment."id" = deployment."assignmentId"
),
first_attempts AS (
  SELECT
    ordered.*,
    ROW_NUMBER() OVER (
      PARTITION BY ordered."classAssignmentId", ordered."membershipId"
      ORDER BY ordered."all_rank" ASC
    )::INTEGER AS "credit_rank"
  FROM ordered
  WHERE ordered."replay_rank" = 1
),
classified AS (
  SELECT
    ordered."id",
    ordered."all_rank",
    ordered."problemCount",
    first_attempts."credit_rank",
    (
      ordered."replay_rank" = 1
      AND first_attempts."credit_rank" <= ordered."problemCount"
    ) AS "credited"
  FROM ordered
  LEFT JOIN first_attempts ON first_attempts."id" = ordered."id"
)
UPDATE "WritingPracticeAttempt" AS attempt
SET
  "position" = CASE
    WHEN classified."credited" THEN classified."credit_rank"
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
