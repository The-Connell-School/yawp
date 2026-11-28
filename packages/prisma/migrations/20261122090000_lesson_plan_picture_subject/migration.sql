SET lock_timeout = '5s';

-- A picture on every teaching slide (Nov 22): what a found picture is of, so
-- one kept for a subject is reused by the next lesson that wants it.
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN "subject" TEXT;
CREATE INDEX "LessonPlanUploadPicture_subject_idx" ON "LessonPlanUploadPicture"("subject");
