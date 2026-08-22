-- Every member of a group has to press Submit before the draft is submitted.
--
-- Until now the first press created the Submission for the whole group, which
-- ends everybody else's chance to change a document they co-wrote. One student
-- pressing at 9:02 could hand in a paragraph a partner was still in the middle
-- of. A press is now a signal from one member; the Submission is created by the
-- press that completes the set.
--
-- Additive and back-compatible. The column is nullable with no default, so every
-- existing row reads as "has not pressed for the current round" — and since
-- collaborative drafts are still gated off in production
-- (Organization.collaborativeDraftsEnabled defaults to false), there is no group
-- anywhere with a half-finished round to migrate. Solo submission
-- (api.domain.submit-document) does not touch this table at all.
--
-- The mark is cleared for every member when the group's Submission is created,
-- so the column always describes the round in progress. A teacher who unsubmits
-- is therefore asking the whole group to agree again, rather than handing the
-- draft back in on the strength of presses from before the change.

BEGIN;

ALTER TABLE "DocumentGroupMember"
  ADD COLUMN "submittedAt" TIMESTAMPTZ(6);

-- Serves the readiness read, which always asks one group "who is still to
-- press?" alongside the existing removedAt filter.
CREATE INDEX "DocumentGroupMember_groupId_submittedAt_idx"
  ON "DocumentGroupMember"("groupId", "submittedAt");

COMMIT;
