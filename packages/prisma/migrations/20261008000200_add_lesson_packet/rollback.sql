SET lock_timeout = '5s';

DROP INDEX IF EXISTS "LessonPlanMessage_conversationId_keptAt_idx";
ALTER TABLE "LessonPlanMessage" DROP COLUMN IF EXISTS "keptAudience", DROP COLUMN IF EXISTS "keptAt";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "packetTitle";
