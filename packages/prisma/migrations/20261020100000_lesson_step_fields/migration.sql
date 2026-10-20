SET lock_timeout = '5s';

-- Lesson Planner stack page (Brian's run 3, Kevin's stack page redesign):
-- each step carries its own minutes, type, label and handout state, and
-- remembers the YAWP! assignment created from it. Additive and nullable:
-- null falls back to what the app read out of the title before.
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "minutes" INTEGER;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "stepType" TEXT;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "label" TEXT;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "hasHandout" BOOLEAN;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "yawpAssignmentId" TEXT;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "yawpHref" TEXT;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "yawpCreatedAt" TIMESTAMPTZ(6);
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "studentVersion" TEXT;
ALTER TABLE "LessonPlanMaterial" ADD COLUMN "studentVersionKey" TEXT;
