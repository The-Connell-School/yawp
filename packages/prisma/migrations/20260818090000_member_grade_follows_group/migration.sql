-- Whether a student simply takes the group's grade.
--
-- Most students do. A teacher with thirty students in ten groups should type the
-- group grade once and override only the two or three outliers, rather than
-- entering thirty individual grades.
--
-- The group grade is never copied onto member rows: it is derived at read time
-- from the group's Submission, and this flag only says whether an override
-- exists. So re-grading the group flows to every follower automatically, and
-- never disturbs a row a teacher deliberately set.
--
-- Defaults to true, which is also the right answer for rows written before this
-- column existed: they carry a score, and setting a score clears the flag, so
-- the backfill below keeps those overrides intact.

BEGIN;

ALTER TABLE "DocumentGroupMemberGrade"
  ADD COLUMN "followsGroupGrade" BOOLEAN NOT NULL DEFAULT true;

-- Any row that already has a score was an explicit individual grade.
UPDATE "DocumentGroupMemberGrade"
   SET "followsGroupGrade" = false
 WHERE "score" IS NOT NULL;

COMMIT;
