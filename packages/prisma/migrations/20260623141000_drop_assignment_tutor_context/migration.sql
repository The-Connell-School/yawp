BEGIN;

ALTER TABLE "Assignment"
  DROP COLUMN IF EXISTS "tutorContext";

COMMIT;
