SET lock_timeout = '5s';

-- Brian's round 5, item 12: "Planned in" counts the time a teacher actually
-- spent on the lesson, with it open and in use, until it is set.
ALTER TABLE "LessonPlanConversation" ADD COLUMN IF NOT EXISTS "activeSeconds" INTEGER NOT NULL DEFAULT 0;
