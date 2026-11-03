SET lock_timeout = '5s';

ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "planSummaryKey";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "planSummary";
