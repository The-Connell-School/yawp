-- Assignment creation standardization: additive grading intent fields.
-- Backward compatible: existing assignments behave as graded 100-point work.

ALTER TABLE "Assignment"
  ADD COLUMN "submitForGrade" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN "pointValue" INTEGER DEFAULT 100;

UPDATE "Assignment"
SET "pointValue" = 100
WHERE "submitForGrade" = TRUE
  AND "pointValue" IS NULL;

ALTER TABLE "Assignment"
  ADD CONSTRAINT "Assignment_pointValue_valid_when_graded"
  CHECK (
    ("submitForGrade" = FALSE AND "pointValue" IS NULL)
    OR
    ("submitForGrade" = TRUE AND "pointValue" BETWEEN 1 AND 1000)
  );
