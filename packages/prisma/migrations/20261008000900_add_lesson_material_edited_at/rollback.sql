SET lock_timeout = '5s';

ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "editedAt";
