-- Add post (release) date and due date to per-class assignment deployments.
-- Both are optional; when postAt is in the future, students must not see it.

BEGIN;

ALTER TABLE "ClassAssignment"
  ADD COLUMN "postAt" TIMESTAMPTZ(6),
  ADD COLUMN "dueAt"  TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "ClassAssignment_postAt_idx"
  ON "ClassAssignment"("postAt");

CREATE INDEX IF NOT EXISTS "ClassAssignment_dueAt_idx"
  ON "ClassAssignment"("dueAt");

COMMIT;

