SET lock_timeout = '5s';

-- Pictures that belong (Nov 21): a picture the planner found in an open
-- collection, with its credit, license and source. All optional: the
-- teacher's own pictures leave them empty.
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN "origin" TEXT;
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN "credit" TEXT;
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN "license" TEXT;
ALTER TABLE "LessonPlanUploadPicture" ADD COLUMN "sourceUrl" TEXT;
