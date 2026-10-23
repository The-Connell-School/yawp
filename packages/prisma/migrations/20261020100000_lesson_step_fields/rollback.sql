SET lock_timeout = '5s';

ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "studentVersionKey";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "studentVersion";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "yawpCreatedAt";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "yawpHref";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "yawpAssignmentId";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "hasHandout";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "label";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "stepType";
ALTER TABLE "LessonPlanMaterial" DROP COLUMN IF EXISTS "minutes";
