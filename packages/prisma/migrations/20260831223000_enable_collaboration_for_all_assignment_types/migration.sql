-- Collaborative drafts are now available as an explicit per-assignment option
-- for every assignment type. Keep this legacy column permissive during rolling
-- deploys so an older app instance cannot reject work created by a newer one.

BEGIN;

ALTER TABLE "AssignmentType"
  ALTER COLUMN "collaborationSupported" SET DEFAULT true;

UPDATE "AssignmentType"
   SET "collaborationSupported" = true
 WHERE "collaborationSupported" = false;

COMMIT;
