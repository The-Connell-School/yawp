SET lock_timeout = '5s';

ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "activeReportedAt";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "activeSince";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "activeSeconds";
