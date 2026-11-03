SET lock_timeout = '5s';

ALTER TABLE "LessonPlanTemplate" DROP COLUMN IF EXISTS "days";
ALTER TABLE "LessonPlanUnit" DROP COLUMN IF EXISTS "framework";
