SET lock_timeout = '5s';

DROP INDEX IF EXISTS "LessonPlanConversation_membershipId_publishedAt_idx";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "publishedAt";
