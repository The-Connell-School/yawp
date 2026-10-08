SET lock_timeout = '5s';

-- Starring a lesson is the teacher's own decision about what is worth finding
-- again, kept separate from whether a reply was kept in the printable packet.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "starredAt" TIMESTAMPTZ(6);

CREATE INDEX "LessonPlanConversation_membershipId_starredAt_idx"
  ON "LessonPlanConversation" ("membershipId", "starredAt" DESC);
