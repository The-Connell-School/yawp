SET lock_timeout = '5s';

DROP TABLE IF EXISTS "LessonPlanUploadPicture";
ALTER TABLE "LessonPlanUpload" DROP COLUMN IF EXISTS "mode";
ALTER TABLE "LessonPlanUpload" DROP COLUMN IF EXISTS "keptDeck";
ALTER TABLE "LessonPlanUpload" DROP COLUMN IF EXISTS "file";
