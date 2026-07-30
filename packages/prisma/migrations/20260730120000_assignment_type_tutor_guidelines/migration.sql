-- Course-level tutor guidelines.
--
-- Tutor guidance previously had only module- and step-level homes, so guidance
-- that should hold across an entire course had nowhere to live and nothing in
-- the admin UI showed which layers were in effect. This column is the course
-- layer; the universal YAWP guidelines stay code-owned and always applied.
--
-- Additive and nullable: existing assignment types keep tutoring exactly as
-- configured until an admin fills this in.

BEGIN;

ALTER TABLE "AssignmentType"
  ADD COLUMN IF NOT EXISTS "tutorInstructions" TEXT;

COMMIT;
