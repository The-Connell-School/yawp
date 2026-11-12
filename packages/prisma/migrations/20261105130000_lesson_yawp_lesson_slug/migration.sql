SET lock_timeout = '5s';

-- How to Teach It → ready-built lesson plans (Kevin, Nov 5): which Yawp!
-- lesson a conversation is the teacher's copy of, e.g. "pre-writing", so
-- opening it again opens the same copy. Null: the teacher's own lesson.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "yawpLessonSlug" TEXT;

CREATE INDEX "LessonPlanConversation_membershipId_yawpLessonSlug_idx"
  ON "LessonPlanConversation"("membershipId", "yawpLessonSlug");
