SET lock_timeout = '5s';

-- Pictures added in the slide editor have no upload; they go with the rollback.
DELETE FROM "LessonPlanUploadPicture" WHERE "uploadId" IS NULL;
ALTER TABLE "LessonPlanUploadPicture" DROP CONSTRAINT IF EXISTS "LessonPlanUploadPicture_conversationId_fkey";
DROP INDEX IF EXISTS "LessonPlanUploadPicture_conversationId_idx";
ALTER TABLE "LessonPlanUploadPicture" DROP COLUMN IF EXISTS "conversationId";
ALTER TABLE "LessonPlanUploadPicture" ALTER COLUMN "uploadId" SET NOT NULL;
ALTER TABLE "LessonPlanUpload" DROP COLUMN IF EXISTS "deckMessageId";
