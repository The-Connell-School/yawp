SET lock_timeout = '5s';

ALTER TABLE "LessonPlanConversation" DROP CONSTRAINT IF EXISTS "LessonPlanConversation_unitId_fkey";
DROP INDEX IF EXISTS "LessonPlanConversation_unitId_unitDay_idx";
ALTER TABLE "LessonPlanConversation" DROP COLUMN IF EXISTS "unitDay", DROP COLUMN IF EXISTS "unitId";
DROP TABLE IF EXISTS "LessonPlanUnit";
