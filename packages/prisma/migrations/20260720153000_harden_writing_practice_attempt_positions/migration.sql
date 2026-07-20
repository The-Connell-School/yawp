-- Give every historical attempt a stable sequence position. Existing rows
-- predate persisted positions, so preserve their chronological progress order.
ALTER TABLE "WritingPracticeAttempt"
  ADD COLUMN "position" INTEGER;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "classAssignmentId", "membershipId"
      ORDER BY "createdAt" ASC, "id" ASC
    )::INTEGER AS "position"
  FROM "WritingPracticeAttempt"
)
UPDATE "WritingPracticeAttempt" AS attempt
SET "position" = ranked."position"
FROM ranked
WHERE attempt."id" = ranked."id";

ALTER TABLE "WritingPracticeAttempt"
  ALTER COLUMN "position" SET NOT NULL;

CREATE UNIQUE INDEX "WritingPracticeAttempt_classAssignmentId_membershipId_position_key"
  ON "WritingPracticeAttempt"("classAssignmentId", "membershipId", "position");
