-- A teacher may submit a group's shared draft for them.
--
-- The companion to "every member presses Submit": that rule lets one student who
-- never presses hold up the rest of their group, and the only person outside the
-- group who can resolve that is the teacher. This column records when they did,
-- so the students are told their draft went in without them rather than being
-- left to work it out from a grade.
--
-- Additive and nullable. Null on every submission that already exists and on
-- every one a group makes itself, so nothing about solo submission changes.
-- SET NULL on delete, matching gradedBy and unsubmittedBy: losing a teacher's
-- membership row must never take a submission with it.

BEGIN;

ALTER TABLE "Submission"
  ADD COLUMN "submittedByTeacherMembershipId" TEXT;

ALTER TABLE "Submission"
  ADD CONSTRAINT "Submission_submittedByTeacherMembershipId_fkey"
  FOREIGN KEY ("submittedByTeacherMembershipId") REFERENCES "OrgMembership"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
