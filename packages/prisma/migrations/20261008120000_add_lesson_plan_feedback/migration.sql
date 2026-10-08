SET lock_timeout = '5s';

-- Teacher feedback on the Lesson Planner: a verdict per reply, and whether a
-- lesson was taught. Additive and nullable; nothing existing reads these.
ALTER TABLE "LessonPlanMessage" ADD COLUMN "rating" TEXT;
ALTER TABLE "LessonPlanMessage" ADD COLUMN "ratingNote" TEXT;
ALTER TABLE "LessonPlanMessage" ADD COLUMN "ratedAt" TIMESTAMPTZ(6);
ALTER TABLE "LessonPlanConversation" ADD COLUMN "taughtAt" TIMESTAMPTZ(6);

CREATE INDEX "LessonPlanMessage_ratedAt_idx" ON "LessonPlanMessage"("ratedAt" DESC);
