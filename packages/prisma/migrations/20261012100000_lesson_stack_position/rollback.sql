SET lock_timeout = '5s';

ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "position";
ALTER TABLE "LessonPlanMessage" DROP COLUMN IF EXISTS "position";
