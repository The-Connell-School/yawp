SET lock_timeout = '5s';

ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "lessonDate";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "setAt";
