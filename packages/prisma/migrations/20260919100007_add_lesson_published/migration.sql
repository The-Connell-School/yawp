-- A teacher's lessons split in two: drafts they are still working on, and the
-- ones they have published to their library. Starring tried to do this job and
-- could not — it ranked one list rather than dividing it, so a half-finished
-- lesson and one taught for three years sat in the same place.
--
-- `starredAt` is left in place, unread. Dropping a column is not reversible and
-- starring may come back; an unread column costs nothing until then.
ALTER TABLE "LessonPlanConversation"
  ADD COLUMN "publishedAt" TIMESTAMPTZ(6);

-- The library reads published lessons newest first; the planner's own rail
-- reads the drafts. Both want this index.
CREATE INDEX "LessonPlanConversation_membershipId_publishedAt_idx"
  ON "LessonPlanConversation" ("membershipId", "publishedAt" DESC);
