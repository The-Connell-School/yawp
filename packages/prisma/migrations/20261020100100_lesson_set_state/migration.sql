SET lock_timeout = '5s';

-- "This lesson is set" (stack page redesign): when the teacher set it, and
-- the day it will be taught. Null: not set, and no date chosen.
ALTER TABLE "LessonPlanConversation" ADD COLUMN "setAt" TIMESTAMPTZ(6);
ALTER TABLE "LessonPlanConversation" ADD COLUMN "lessonDate" TIMESTAMPTZ(6);
